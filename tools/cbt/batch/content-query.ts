// STEP 10 — batch-review / batch-promote용 GeneratedQuestion 상태별 목록 조회.
// STEP 8 ContentDb에 findMany가 없으므로, 기존 파일을 수정하지 않고
// 이 모듈에서 자체 최소 인터페이스(BatchContentDb)를 정의한다.
// read-only 목록 조회만 제공한다 (쓰기 없음).
import type { GeneratedQuestion, Prisma } from "@/generated/prisma/client";
import type { GeneratedQuestionStatus } from "../content/types";

/** 상태별 조회에 필요한 Prisma delegate 최소 인터페이스 */
export type BatchContentDb = {
  generatedQuestion: {
    findMany(
      args: Prisma.GeneratedQuestionFindManyArgs,
    ): Promise<GeneratedQuestion[]>;
  };
};

/** 기본 DB (실제 Prisma). CLI/운영에서 사용 */
export async function getDefaultBatchContentDb(): Promise<BatchContentDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as BatchContentDb;
}

/**
 * 특정 상태의 GeneratedQuestion 목록을 createdAt asc 순서로 조회한다.
 * select 없이 전체 필드를 가져온다 (review/promote가 상태·내용을 읽어야 하므로).
 */
export async function listGeneratedByStatus(
  db: BatchContentDb,
  status: GeneratedQuestionStatus,
): Promise<GeneratedQuestion[]> {
  return db.generatedQuestion.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
  });
}
