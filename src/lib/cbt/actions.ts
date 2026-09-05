"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  enforceDistinctRequestLimit,
  enforceRequestRateLimit,
  SECURITY_RATE_LIMITS,
  SecurityRateLimitError,
} from "@/lib/security/rate-limit";
import type { ExamGradeResult } from "./exam";
import {
  gradeCbtAnswer,
  recordPracticeResult,
  submitExam,
  toggleBookmark,
} from "./service";
import type { GradeResult } from "./types";

export type GradeCbtAnswerResult =
  | { ok: true; data: GradeResult }
  | { ok: false; message: string };

export type SubmitCbtExamResult =
  | { ok: true; data: ExamGradeResult }
  | { ok: false; message: string };

export type ToggleCbtBookmarkResult =
  | { ok: true; data: { bookmarked: boolean } }
  | { ok: false; message: string };

export async function gradeCbtAnswerAction(
  questionId: string,
  selectedOptionId: number,
): Promise<GradeCbtAnswerResult> {
  try {
    const requestHeaders = await headers();
    await enforceRequestRateLimit({
      headers: requestHeaders,
      scope: "cbt:answer",
      policy: SECURITY_RATE_LIMITS.cbtAnswer,
    });
    await enforceDistinctRequestLimit({
      headers: requestHeaders,
      scope: "cbt:distinct-question",
      distinctValue: questionId,
      policy: SECURITY_RATE_LIMITS.cbtDistinctQuestions,
    });
    const result = await gradeCbtAnswer(questionId, selectedOptionId);

    const user = await getCurrentUser();
    if (user) {
      try {
        await recordPracticeResult(
          user.id,
          questionId,
          selectedOptionId,
          result.isCorrect,
        );
      } catch {
        // 기록 실패는 채점 결과에 영향을 주지 않는다.
      }
    }

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof SecurityRateLimitError) {
      return { ok: false, message: "풀이 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요." };
    }
    const message =
      error instanceof Error ? error.message : "채점 중 오류가 발생했습니다.";
    return { ok: false, message };
  }
}

export async function submitCbtExamAction(
  categorySlug: string,
  answers: Record<string, number>,
  durationSeconds: number | null,
): Promise<SubmitCbtExamResult> {
  try {
    await enforceRequestRateLimit({
      headers: await headers(),
      scope: "cbt:exam-submit",
      policy: SECURITY_RATE_LIMITS.cbtExamSubmit,
    });
    const user = await getCurrentUser();
    const result = await submitExam(
      categorySlug,
      answers,
      durationSeconds,
      user?.id ?? null,
    );
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof SecurityRateLimitError) {
      return { ok: false, message: "시험 제출 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
    }
    const message =
      error instanceof Error ? error.message : "시험 제출 중 오류가 발생했습니다.";
    return { ok: false, message };
  }
}

export async function toggleCbtBookmarkAction(
  questionId: string,
): Promise<ToggleCbtBookmarkResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, message: "로그인하면 문제를 저장할 수 있습니다." };
    }
    const bookmarked = await toggleBookmark(user.id, questionId);
    return { ok: true, data: { bookmarked } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "북마크 처리 중 오류가 발생했습니다.";
    return { ok: false, message };
  }
}
