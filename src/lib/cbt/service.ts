import { badRequest, notFound } from "@/lib/api/errors";
import {
  getQuestionAnswerForGrading,
  type CbtQuestionForGrading,
} from "./dal";
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
