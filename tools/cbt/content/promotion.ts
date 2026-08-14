// STEP 8 — Master Promotion (STEP 8 §19).
// APPROVED 상태의 GeneratedQuestion만 MasterQuestion으로 승격한다.
// - idempotent: 같은 generatedQuestionId로 두 번 promote해도 중복 생성하지 않는다.
// - MasterQuestion 생성은 하나의 transaction 안에서 처리한다.
// - 자동 APPROVED를 만들지 않는다 (반드시 Human Review를 거친 상태).
// MasterQuestion은 원자료 HTML/raw LLM response 등 무거운 백오피스 데이터를 포함하지 않는다.
import { Prisma } from "@/generated/prisma/client";
import type { GeneratedQuestionStatus } from "./types";
import type { ContentDb } from "./persist/content-repository";
import {
  findGeneratedQuestionById,
  findMasterByGeneratedQuestionId,
} from "./persist/content-repository";

export type PromotionOutcome = {
  masterQuestionId: string;
  created: boolean;
};

/**
 * APPROVED GeneratedQuestion → MasterQuestion 승격 (idempotent, transaction).
 * - 상태가 APPROVED가 아니면 Error (자동 승격 금지).
 * - 이미 Master가 있으면 그대로 반환 (created=false).
 */
export async function promoteToMaster(
  db: ContentDb,
  generatedQuestionId: string,
): Promise<PromotionOutcome> {
  const question = await findGeneratedQuestionById(db, generatedQuestionId);
  if (!question) {
    throw new Error(`generated question not found: ${generatedQuestionId}`);
  }

  const status = question.status as GeneratedQuestionStatus;
  if (status !== "APPROVED") {
    throw new Error(
      `promote 불가: 상태 ${status} (APPROVED만 승격 가능, Human Review 필수)`,
    );
  }

  const existing = await findMasterByGeneratedQuestionId(db, generatedQuestionId);
  if (existing) {
    return { masterQuestionId: existing.id, created: false };
  }

  const choices = Array.isArray(question.choices)
    ? (question.choices as unknown as { index: number; text: string }[])
    : [];
  const answers = Array.isArray(question.answers)
    ? (question.answers as unknown as number[])
    : [];
  const questionText = question.questionText;
  if (typeof questionText !== "string" || questionText.length === 0) {
    throw new Error(`promote 불가: 생성된 문제 내용이 없습니다 (${generatedQuestionId})`);
  }
  const category = question.category;
  const difficulty = question.difficulty;
  if (typeof category !== "string" || category.length === 0) {
    throw new Error(`promote 불가: category가 없습니다 (${generatedQuestionId})`);
  }
  if (typeof difficulty !== "string" || difficulty.length === 0) {
    throw new Error(`promote 불가: difficulty가 없습니다 (${generatedQuestionId})`);
  }

  const outcome = await db.$transaction(async (tx) => {
    const master = await tx.masterQuestion.create({
      data: {
        generatedQuestionId,
        category,
        questionText,
        choices: choices as unknown as Prisma.InputJsonValue,
        answers: answers as unknown as Prisma.InputJsonValue,
        explanation: question.explanation,
        difficulty,
        isActive: true,
        publishedAt: new Date(),
      },
    });
    return master;
  });

  return { masterQuestionId: outcome.id, created: true };
}
