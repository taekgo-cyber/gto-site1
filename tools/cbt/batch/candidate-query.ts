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
    ): Promise<{ candidateQuestionId: string; status: string }[]>;
  };
};

/** 기본 DB (실제 Prisma). CLI/운영에서 사용 */
export async function getDefaultBatchDb(): Promise<BatchCandidateDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as BatchCandidateDb;
}

export type GenerationTargetSelection = {
  targets: CandidateQuestion[];
  /** 정상(비재시도) GeneratedQuestion을 이미 보유해 제외된 candidate 수 */
  skippedExisting: number;
  /** 제외 후, limit 적용 전 전체 eligible 수 */
  totalEligible: number;
};

export type GenerationTargetSelectionOptions = {
  /** 정상 GQ 제외를 끈다(기본 false). true면 모든 candidate를 대상(강제 재생성) */
  includeExisting?: boolean;
  /** 명시적 대상 ID. 제공 시 순서를 유지하되 REJECTED는 항상 제외한다 */
  ids?: string[];
  /** candidate.category 필터 (배치 선택 모드에서만 적용) */
  category?: string;
};

/**
 * safety re-entry 상태 목록: 이 상태의 GeneratedQuestion은 재시도 대상이다.
 * - FAILED: 생성 실패 → 재시도 안전
 * - QA_FAILED: QA 자동 탈락 → 재시도 안전
 * 정상 생성/승격(GENERATED/QA_PASSED/APPROVED/NORMAL 등)은 재시도 대상이 아니며,
 * candidate가 정상 GQ를 하나라도 보유하면 항상 스킵된다 (숫자 채우기 금지).
 */
const RETRYABLE_STATUSES = new Set(["FAILED", "QA_FAILED"]);

/**
 * batch-generate 대상 Candidate 목록을 선택한다.
 * - ids가 주어지면 그 ID를 입력 순서대로 대상으로 삼되, 어느 경로든
 *   REJECTED candidate는 절대 대상에 포함하지 않는다 (안전 정책).
 * - ids가 없으면 REJECTED가 아닌 후보만 대상 (선택 모드, category 필터 가능).
 * - idempotency(기본): 재시도 대상(FAILED/QA_FAILED) GQ만 있는 후보는 다시 대상에
 *   포함하고, 정상 GQ가 하나라도 있으면 제외한다. --force로 강제 재생성만 모든 것을 포함한다.
 * - limit/guard는 여기서 처리하지 않는다 (generate.ts가 담당).
 */
export async function listGenerationTargets(
  db: BatchCandidateDb,
  options: GenerationTargetSelectionOptions = {},
): Promise<GenerationTargetSelection> {
  let orderedIds: string[];

  if (options.ids && options.ids.length > 0) {
    // 명시적 ID: 순서 유지. REJECTED validation guard는 절대 우회하지 않는다.
    const byId = new Map(
      (
        await db.candidateQuestion.findMany({
          where: {
            id: { in: options.ids },
            validationStatus: { not: "REJECTED" },
          },
        })
      ).map((row) => [row.id, row]),
    );
    const found: string[] = [];
    for (const id of options.ids) {
      if (byId.has(id)) found.push(id);
    }
    orderedIds = found;
  } else {
    const eligible = await db.candidateQuestion.findMany({
      where: {
        validationStatus: { not: "REJECTED" },
        ...(options.category ? { category: options.category } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    orderedIds = eligible.map((row) => row.id);
  }

  let ids = orderedIds;
  let skippedExisting = 0;

  // 2) idempotency — 정상 GQ가 있는 후보만 제외 (재시도 대상은 다시 포함)
  if (!options.includeExisting) {
    const generated = await db.generatedQuestion.findMany({
      select: { candidateQuestionId: true, status: true },
    });
    const skippedCandidateIds = new Set<string>();
    for (const row of generated) {
      if (!RETRYABLE_STATUSES.has(row.status)) {
        skippedCandidateIds.add(row.candidateQuestionId);
      }
    }
    ids = ids.filter((id) => {
      if (skippedCandidateIds.has(id)) {
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
    where: {
      id: { in: ids },
      // 마지막 full row 조회에도 REJECTED를 다시 제한해, 중간 상태 변경에도 안전 정책을 유지한다.
      validationStatus: { not: "REJECTED" },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const targets = ids
    .map((id) => byId.get(id))
    .filter((row): row is CandidateQuestion => row !== undefined);

  return { targets, skippedExisting, totalEligible: targets.length };
}
