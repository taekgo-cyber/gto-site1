"use server";

import { gradeCbtAnswer } from "./service";
import type { GradeResult } from "./types";

export type GradeCbtAnswerResult =
  | { ok: true; data: GradeResult }
  | { ok: false; message: string };

export async function gradeCbtAnswerAction(
  questionId: string,
  selectedOptionId: number,
): Promise<GradeCbtAnswerResult> {
  try {
    const result = await gradeCbtAnswer(questionId, selectedOptionId);
    return { ok: true, data: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "채점 중 오류가 발생했습니다.";
    return { ok: false, message };
  }
}
