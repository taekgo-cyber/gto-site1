// STEP 9 — batch-generate 대상 Candidate 선택 쿼리 (STEP 9 BUILD HANDOFF §2.5).
// STEP 8 ContentDb 인터페이스에 findMany가 없으므로, 기존 파일을 수정하지 않고
// 이 모듈에서 자체 최소 인터페이스(BatchCandidateDb)를 정의한다.
// idempotency: 이미 GeneratedQuestion이 있는 candidate는 기본 제외한다(재생성 방지).
import type { Prisma, CandidateQuestion } from "@/generated/prisma/client";

/** batch-generate에서 사용하는 Prisma delegate 최소 인터페이스 */
export type BatchCandidateDb = {
  candidateQuestion: {
    findMany(
      args: Prisma.CandidateQuestionFindManyArgs,
    ): Promise<CandidateQuestion[]>;
  };
  generatedQuestion: {
    findMany(
      args: Prisma.GeneratedQuestionFindManyArgs,
    ): Promise<{ candidateQuestionId: string }[]>;
  };
};

/** 기본 DB (실제 Prisma). CLI/운영에서 사용 */
export async function getDefaultBatchDb(): Promise<BatchCandidateDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as BatchCandidateDb;
}

export type GenerationTargetSelection = {
  targets: CandidateQuestion[];
  /** GeneratedQuestion이 이미 있어 제외된 candidate 수 */
  skippedExisting: number;
  /** 제외 후, limit 적용 전 전체 eligible 수 */
  totalEligible: number;
};

/**
 * batch-generate 대상 Candidate 목록을 선택한다.
 * - REJECTED가 아닌 후보만 대상 (newbt 후보는 answer 부재로 전부 REVIEW_REQUIRED).
 * - includeExisting !== true면 GeneratedQuestion이 이미 있는 후보를 제외한다.
 * - limit/guard는 여기서 처리하지 않는다 (generate.ts가 담당).
 */
export async function listGenerationTargets(
  db: BatchCandidateDb,
  options: { includeExisting?: boolean } = {},
): Promise<GenerationTargetSelection> {
  // 1) REJECTED 제외 + createdAt asc로 가벼운 id 스캔
  const eligible = await db.candidateQuestion.findMany({
    where: { validationStatus: { not: "REJECTED" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let ids = eligible.map((row) => row.id);
  let skippedExisting = 0;

  // 2) 이미 생성된 candidate 제외 (idempotency)
  if (!options.includeExisting) {
    const generated = await db.generatedQuestion.findMany({
      select: { candidateQuestionId: true },
    });
    const generatedSet = new Set(
      generated.map((row) => row.candidateQuestionId),
    );
    ids = ids.filter((id) => {
      if (generatedSet.has(id)) {
        skippedExisting += 1;
        return false;
      }
      return true;
    });
  }

  // 3) 남은 ID 순서대로 full row 조회
  if (ids.length === 0) {
    return { targets: [], skippedExisting, totalEligible: 0 };
  }
  const rows = await db.candidateQuestion.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const targets = ids
    .map((id) => byId.get(id))
    .filter((row): row is CandidateQuestion => row !== undefined);

  return { targets, skippedExisting, totalEligible: targets.length };
}
