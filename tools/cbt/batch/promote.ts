// STEP 10 — batch-promote orchestration (STEP 10 PLAN §7).
// APPROVED GeneratedQuestion → MasterQuestion 일괄 승격.
// - 기존 promoteToMaster()를 건별 호출한다 (건별 단일 transaction).
// - batch 전체를 하나의 transaction으로 묶지 않는다.
// - runPool로 제한된 concurrency (기본 3, 최대 10).
// - 개별 실패가 batch를 중단시키지 않는다 (failure isolation).
// - idempotency: 이미 Master가 있으면 promoteToMaster가 created=false 반환 → skipped.
// - P2002 unique 위반(race) → skipped (already promoted).
import type { ContentDb } from "../content/persist/content-repository";
import { getDefaultContentDb } from "../content/persist/content-repository";
import { promoteToMaster } from "../content/promotion";
import {
  getDefaultBatchContentDb,
  listGeneratedByStatus,
  type BatchContentDb,
} from "./content-query";
import { resolveBatchScope } from "./guard";
import { createBatchLogger, type BatchLogger } from "./logger";
import { runPool } from "../pipeline/pool";
import type { BatchSummary } from "./types";

export const MAX_PROMOTE_CONCURRENCY = 10;
export const DEFAULT_PROMOTE_CONCURRENCY = 3;

export type PromoteItemOutcome = "promoted" | "skipped" | "failed";

export type PromoteItemResult = {
  generatedQuestionId: string;
  outcome: PromoteItemOutcome;
  masterQuestionId?: string;
  error?: string;
  durationMs: number;
};

export type BatchPromoteOptions = {
  /** 명시적 GeneratedQuestion ID 목록 (--ids/--ids-file) */
  ids: string[];
  all?: boolean;
  limit: number | null;
  dryRun?: boolean;
  concurrency?: number;
};

export type BatchPromoteDeps = {
  contentDb?: ContentDb;
  batchDb?: BatchContentDb;
  logger?: BatchLogger;
};

/** Prisma known request error P2002 (unique constraint violation) 여부 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function runBatchPromote(
  opts: BatchPromoteOptions,
  deps: BatchPromoteDeps = {},
): Promise<BatchSummary<PromoteItemResult>> {
  const logger = deps.logger ?? createBatchLogger("batch-promote");
  const contentDb = deps.contentDb ?? (await getDefaultContentDb());
  const batchDb = deps.batchDb ?? (await getDefaultBatchContentDb());

  const startedAt = Date.now();

  let ids: string[];
  if (opts.all === true) {
    const rows = await listGeneratedByStatus(batchDb, "APPROVED");
    ids = rows.map((r) => r.id);
  } else {
    ids = opts.ids;
  }

  const targetCount = resolveBatchScope(
    { limit: opts.limit, all: opts.all === true },
    ids.length,
  );
  ids = ids.slice(0, targetCount);

  if (opts.dryRun === true) {
    logger.info(`dry-run: 승격 대상 ${ids.length}건 (DB 변경 없음)`);
    for (let i = 0; i < ids.length; i += 1) {
      logger.progress(i + 1, ids.length, `${ids[i]} → 승격 대상`);
    }
    return {
      total: ids.length,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      results: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const concurrency = Math.min(
    MAX_PROMOTE_CONCURRENCY,
    Math.max(1, opts.concurrency ?? DEFAULT_PROMOTE_CONCURRENCY),
  );
  logger.info(
    `concurrency=${concurrency} (기본 ${DEFAULT_PROMOTE_CONCURRENCY}, 최대 ${MAX_PROMOTE_CONCURRENCY})`,
  );

  const results = await runPool(ids, concurrency, async (id) => {
    const itemStartedAt = Date.now();
    try {
      const outcome = await promoteToMaster(contentDb, id);
      if (outcome.created) {
        logger.info(`${id} → promoted (${outcome.masterQuestionId})`);
        return {
          generatedQuestionId: id,
          outcome: "promoted" as const,
          masterQuestionId: outcome.masterQuestionId,
          durationMs: Date.now() - itemStartedAt,
        };
      }
      logger.info(`${id} → skipped (이미 승격됨)`);
      return {
        generatedQuestionId: id,
        outcome: "skipped" as const,
        masterQuestionId: outcome.masterQuestionId,
        durationMs: Date.now() - itemStartedAt,
      };
    } catch (error) {
      // unique violation → 동시 승격 race. 이미 승격된 것으로 간주해 skip (batch 중단 금지)
      if (isUniqueViolation(error)) {
        logger.info(`${id} → skipped (unique conflict P2002)`);
        return {
          generatedQuestionId: id,
          outcome: "skipped" as const,
          error: "unique violation (P2002): already promoted",
          durationMs: Date.now() - itemStartedAt,
        };
      }
      logger.info(`${id} → failed`);
      return {
        generatedQuestionId: id,
        outcome: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - itemStartedAt,
      };
    }
  });

  const promoted = results.filter((r) => r.outcome === "promoted").length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const failed = results.filter((r) => r.outcome === "failed").length;

  return {
    total: ids.length,
    succeeded: promoted,
    skipped,
    failed,
    results,
    durationMs: Date.now() - startedAt,
  };
}
