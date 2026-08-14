// STEP 10-4 — NEWBT 카테고리 분류 백필 orchestration.
// 기존 STEP 1~10 코어(normalizer/classify-category)를 수정하지 않고,
// 전수 감사 결과로 확정한 배정표를 DB candidate에 반영하는 전용 경로.
//
// 배경: NEWBT-HWMUL은 category=UNKNOWN으로 수집돼 classifyByKeyword(rule)만
// 동작하는데, 키워드 규칙이 운송 일반 문제 기준이라 화물운송 문제에서
// 미매치(22건)·동점(16건)·오분류(7건)를 유발했다. 160건 전수 감사를 거쳐
// 수동 확정 배정표(UNKNOWN 45건 + VALID 오분류 5건)를 만들어 반영한다.
//
// - 대상: sourceName=NEWBT-HWMUL이고 sourceQuestionId가 배정표에 있는 후보.
// - 반영: category 갱신 + validationErrors에서 category_unclassified 제거 +
//   (그 외 오류가 없으면) validationStatus = VALID.
// - 이미 VALID인 오분류 교정 대상은 카테고리만 교체한다.
// - dry-run: DB 쓰기 없이 적용 대상 목록만 출력.
// - 개별 실패는 batch를 중단시키지 않는다 (No Drop).
import type { Prisma } from "@/generated/prisma/client";
import { CandidateValidationStatus } from "@/generated/prisma/enums";
import { createBatchLogger, type BatchLogger } from "./logger";
import { resolveBatchScope } from "./guard";

export type CategoryBackfillOptions = {
  sourceName: string;
  limit?: number | null;
  all?: boolean;
  dryRun?: boolean;
};

export type CategoryBackfillItemResult = {
  candidateId: string;
  sourceQuestionId: string;
  from: string | null;
  to: string;
  outcome: "applied" | "skipped";
  durationMs: number;
};

export type CategoryBackfillSummary = {
  total: number;
  applied: number;
  skipped: number;
  results: CategoryBackfillItemResult[];
  durationMs: number;
};

export type CategoryBackfillDeps = {
  db?: CategoryBackfillDb;
  logger?: BatchLogger;
};

export type CategoryBackfillRow = {
  id: string;
  sourceName: string;
  sourceQuestionId: string;
  category: string | null;
  validationStatus: string;
  validationErrors: unknown;
};

export type CategoryBackfillDb = {
  candidateQuestion: {
    findMany(
      args: Prisma.CandidateQuestionFindManyArgs,
    ): Promise<CategoryBackfillRow[]>;
    update(
      args: Prisma.CandidateQuestionUpdateArgs,
    ): Promise<CategoryBackfillRow>;
  };
};

/** UNKNOWN 45건 + VALID 오분류 5건의 확정 배정표 (전수 감사 결과) */
export const NEWBT_CATEGORY_ASSIGNMENTS: Record<string, string> = {
  // UNKNOWN 45건
  "92449": "CAT-LAW",
  "92454": "CAT-LAW",
  "92458": "CAT-LAW",
  "92459": "CAT-LAW",
  "92462": "CAT-LAW",
  "92464": "CAT-LAW",
  "92468": "CAT-LAW",
  "92469": "CAT-LAW",
  "92470": "CAT-LAW",
  "92601": "CAT-LAW",
  "92608": "CAT-LAW",
  "92609": "CAT-LAW",
  "92610": "CAT-LAW",
  "92612": "CAT-LAW",
  "92615": "CAT-LAW",
  "92496": "CAT-SAFETY",
  "92498": "CAT-SAFETY",
  "92499": "CAT-SAFETY",
  "92503": "CAT-SAFETY",
  "92504": "CAT-SAFETY",
  "92507": "CAT-SAFETY",
  "92508": "CAT-SAFETY",
  "92593": "CAT-SAFETY",
  "92603": "CAT-SAFETY",
  "92606": "CAT-SAFETY",
  "92945": "CAT-SAFETY",
  "92946": "CAT-SAFETY",
  "92954": "CAT-SAFETY",
  "92956": "CAT-SAFETY",
  "92960": "CAT-SAFETY",
  "92473": "CAT-HANDLING",
  "92482": "CAT-HANDLING",
  "92621": "CAT-HANDLING",
  "92626": "CAT-HANDLING",
  "92627": "CAT-HANDLING",
  "92991": "CAT-HANDLING",
  "92487": "CAT-SERVICE",
  "92571": "CAT-SERVICE",
  "92572": "CAT-SERVICE",
  "92574": "CAT-SERVICE",
  "92575": "CAT-SERVICE",
  "92581": "CAT-SERVICE",
  "93006": "CAT-SERVICE",
  "93020": "CAT-SERVICE",
  "93029": "CAT-SERVICE",
  // VALID 오분류 교정 5건
  "92502": "CAT-SAFETY", // LAW→SAFETY (차량 점검)
  "92505": "CAT-LAW", // HANDLING→LAW (도로 정의)
  "92599": "CAT-LAW", // HANDLING→LAW (운전면허 종별)
  "92957": "CAT-SAFETY", // LAW→SAFETY (엔진 점검)
  "92472": "CAT-HANDLING", // SAFETY→HANDLING (과적 통행 제한)
};

/** validationErrors에서 category_unclassified 제거 */
function stripCategoryErrors(raw: unknown): string[] {
  let errors: string[] = [];
  if (Array.isArray(raw)) {
    errors = raw.filter((e): e is string => typeof e === "string");
  }
  return errors.filter((code) => code !== "category_unclassified");
}

export async function runCategoryBackfill(
  opts: CategoryBackfillOptions,
  deps: CategoryBackfillDeps = {},
): Promise<CategoryBackfillSummary> {
  const logger = deps.logger ?? createBatchLogger("category-backfill");
  const db =
    deps.db ??
    ((await import("@/lib/prisma")) as unknown as { prisma: CategoryBackfillDb })
      .prisma;
  const startedAt = Date.now();

  const targetIds = Object.keys(NEWBT_CATEGORY_ASSIGNMENTS);
  const rows = await db.candidateQuestion.findMany({
    where: {
      sourceName: opts.sourceName,
      sourceQuestionId: { in: targetIds },
    },
  });

  // guard: limit/all 필수 (기존 batch 원칙 준수)
  const scope = resolveBatchScope(
    { limit: opts.limit ?? null, all: opts.all === true },
    rows.length,
  );
  const targets = rows.slice(0, scope);

  const results: CategoryBackfillItemResult[] = [];
  for (const row of targets) {
    const itemStartedAt = Date.now();
    const to = NEWBT_CATEGORY_ASSIGNMENTS[row.sourceQuestionId];
    if (row.category === to) {
      results.push({
        candidateId: row.id,
        sourceQuestionId: row.sourceQuestionId,
        from: row.category,
        to,
        outcome: "skipped",
        durationMs: Date.now() - itemStartedAt,
      });
      continue;
    }

    if (!opts.dryRun) {
      const errors = stripCategoryErrors(row.validationErrors);
      const nextErrors = errors.length > 0 ? errors : [];
      await db.candidateQuestion.update({
        where: { id: row.id },
        data: {
          category: to as Prisma.CandidateQuestionUpdateArgs["data"]["category"],
          ...(nextErrors.length > 0
            ? { validationErrors: nextErrors }
            : {
                validationErrors: [] as unknown as Prisma.CandidateQuestionUpdateArgs["data"]["validationErrors"],
              }),
          ...(errors.length === 0 && row.validationStatus !== "VALID"
            ? { validationStatus: CandidateValidationStatus.VALID }
            : {}),
        },
      });
    }

    results.push({
      candidateId: row.id,
      sourceQuestionId: row.sourceQuestionId,
      from: row.category,
      to,
      outcome: "applied",
      durationMs: Date.now() - itemStartedAt,
    });
    logger.progress(
      results.length,
      targets.length,
      `${row.sourceQuestionId} ` +
        `${row.category ?? "null"} → ${to}${opts.dryRun ? " (dry-run)" : ""}`,
    );
  }

  return {
    total: targets.length,
    applied: results.filter((r) => r.outcome === "applied").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
    durationMs: Date.now() - startedAt,
  };
}
