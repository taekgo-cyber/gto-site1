import { badRequest, notFound } from "@/lib/api/errors";
import { CBT_EXAM_CONFIG } from "./constants";
import {
  getQuestionAnswerForGrading,
  type CbtQuestionForGrading,
  createExamRecord,
  getCbtCategoryBySlug,
  getQuestionActivity,
  getQuestionsForGradingByIds,
  upsertBookmark,
  upsertQuestionActivity,
} from "./dal";
import { gradeExamAnswers, type ExamAnswerMap, type ExamGradeResult } from "./exam";
import { parseCbtOptions } from "./options";
import type { GradeResult } from "./types";

function validateQuestionId(questionId: unknown): string {
  if (typeof questionId !== "string" || questionId.trim() === "") {
    throw badRequest("문제 ID가 올바르지 않습니다.");
  }
  return questionId;
}

function validateSelectedOptionId(selectedOptionId: unknown): number {
  if (
    typeof selectedOptionId !== "number" ||
    !Number.isInteger(selectedOptionId)
  ) {
    throw badRequest("선택한 보기가 올바르지 않습니다.");
  }
  return selectedOptionId;
}

function validateGradableQuestion(
  question: CbtQuestionForGrading | null,
): CbtQuestionForGrading {
  if (!question) throw notFound("문제를 찾을 수 없습니다.");
  if (question.status !== "PUBLISHED") {
    throw notFound("문제를 찾을 수 없습니다.");
  }
  return question;
}

function findOption(question: CbtQuestionForGrading, optionId: number): boolean {
  const options = parseCbtOptions(question.options);
  return options.some((option) => option.id === optionId);
}

export async function gradeCbtAnswer(
  questionId: unknown,
  selectedOptionId: unknown,
): Promise<GradeResult> {
  const questionIdString = validateQuestionId(questionId);
  const optionId = validateSelectedOptionId(selectedOptionId);

  const question = validateGradableQuestion(
    await getQuestionAnswerForGrading(questionIdString),
  );

  if (!findOption(question, optionId)) {
    throw badRequest("선택한 보기가 문제에 존재하지 않습니다.");
  }

  return {
    isCorrect: question.correctOption === optionId,
    correctOption: question.correctOption,
    explanation: question.explanation,
  };
}

// ---------------------------------------------------------------------------
// 사용자별 문제 활동
// ---------------------------------------------------------------------------

/** 학습/모의고사 풀이 결과를 사용자의 문제 활동에 기록한다. */
export async function recordPracticeResult(
  userId: string,
  questionId: string,
  selectedOptionId: number,
  isCorrect: boolean,
): Promise<void> {
  await upsertQuestionActivity({ userId, questionId, isCorrect, selectedOptionId });
}

/** 북마크를 토글하고 토글 후 상태(true=북마크됨)를 반환한다. */
export async function toggleBookmark(
  userId: string,
  questionId: string,
): Promise<boolean> {
  validateGradableQuestion(await getQuestionAnswerForGrading(questionId));
  const activity = await getQuestionActivity(userId, questionId);
  const next = !activity?.bookmarked;
  await upsertBookmark(userId, questionId, next);
  return next;
}

// ---------------------------------------------------------------------------
// 모의고사 제출
// ---------------------------------------------------------------------------

function validateCategorySlug(categorySlug: unknown): string {
  if (typeof categorySlug !== "string" || categorySlug.trim() === "") {
    throw badRequest("시험 구분이 올바르지 않습니다.");
  }
  return categorySlug;
}

function validateAnswers(answers: unknown, max: number): ExamAnswerMap {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw badRequest("답안이 올바르지 않습니다.");
  }

  const record = answers as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) throw badRequest("답안이 비어 있습니다.");
  if (keys.length > max) throw badRequest("답안 개수가 너무 많습니다.");

  const map: ExamAnswerMap = {};
  for (const key of keys) {
    if (key.trim() === "") throw badRequest("답안이 올바르지 않습니다.");
    const value = record[key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw badRequest("답안이 올바르지 않습니다.");
    }
    map[key] = value;
  }
  return map;
}

function validateDurationSeconds(durationSeconds: unknown): number | null {
  if (
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 0
  ) {
    return Math.min(Math.round(durationSeconds), 86400);
  }
  return null;
}

/**
 * 모의고사 답안을 서버에서 일괄 검증·채점한다.
 * - 비로그인도 제출 가능하다 (userId가 null이면 기록만 저장하지 않는다).
 * - 다른 카테고리/DRAFT·HIDDEN 문제/존재하지 않는 optionId는 400으로 차단한다.
 * - 로그인 사용자는 결과와 각 문제 활동을 기록한다.
 */
export async function submitExam(
  categorySlug: unknown,
  answers: unknown,
  durationSeconds: unknown,
  userId: string | null,
): Promise<ExamGradeResult> {
  const slug = validateCategorySlug(categorySlug);
  const answerMap = validateAnswers(answers, CBT_EXAM_CONFIG.maxSubmitAnswers);
  const duration = validateDurationSeconds(durationSeconds);

  const category = await getCbtCategoryBySlug(slug);
  if (!category) throw notFound("시험을 찾을 수 없습니다.");

  const questionIds = Object.keys(answerMap);
  const questions = await getQuestionsForGradingByIds(questionIds);

  const questionMap = new Map(questions.map((question) => [question.id, question]));
  for (const id of questionIds) {
    const question = questionMap.get(id);
    if (!question || question.categoryId !== category.id || question.status !== "PUBLISHED") {
      throw badRequest("제출한 문제가 올바르지 않습니다.");
    }
    const optionIds = parseCbtOptions(question.options).map((option) => option.id);
    if (!optionIds.includes(answerMap[id])) {
      throw badRequest("선택한 보기가 올바르지 않습니다.");
    }
  }

  const graded = gradeExamAnswers(questions, answerMap);

  if (userId) {
    await createExamRecord({
      userId,
      categoryId: category.id,
      totalQuestions: graded.totalQuestions,
      correctCount: graded.correctCount,
      score: graded.score,
      passed: graded.passed,
      durationSeconds: duration,
      details: graded.results.map((result) => ({
        questionId: result.questionId,
        subject: result.subject,
        selectedOptionId: result.selectedOptionId,
        isCorrect: result.isCorrect,
      })),
    });

    for (const result of graded.results) {
      if (result.selectedOptionId !== null) {
        await recordPracticeResult(
          userId,
          result.questionId,
          result.selectedOptionId,
          result.isCorrect,
        );
      }
    }
  }

  return graded;
}
