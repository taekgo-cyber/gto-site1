// STEP 10 — batch-review orchestration (STEP 10 PLAN §6).
// 명시적 ID 또는 QA_PASSED 전체를 대상으로 approve/reject를 일괄 적용한다.
// 상태 판정은 기존 reviewGeneratedQuestion(STEP 8 상태 머신)에 위임한다.
// - 순차 처리 (사람 결정의 기록, 처리량보다 감사 추적이 중요).
// - 개별 실패가 batch를 중단시키지 않는다 (failure isolation).
// - dry-run: 상태 변경 없이 대상 목록만 출력.
// - --all 승인은 confirm flag 없이 실행되지 않는다 (--all safety guard).
import type { ContentDb } from "../content/persist/content-repository";
import { getDefaultContentDb } from "../content/persist/content-repository";
import { reviewGeneratedQuestion, type ReviewAction } from "../content/review";
import type { GeneratedQuestionStatus } from "../content/types";
import {
  getDefaultBatchContentDb,
  listGeneratedByStatus,
  type BatchContentDb,
} from "./content-query";
import { resolveBatchScope } from "./guard";
import { createBatchLogger, type BatchLogger } from "./logger";
import type { BatchSummary } from "./types";

export type { ReviewAction } from "../content/review";

export type ReviewItemOutcome =
  | "approved"
  | "rejected"
  | "skipped"
  | "failed";

export type ReviewItemResult = {
  generatedQuestionId: string;
  outcome: ReviewItemOutcome;
  /** 전이 전 상태 (dry-run/이미 결정 시 현재 상태) */
  previousStatus?: GeneratedQuestionStatus;
  /** 전이 후 상태 */
  status?: GeneratedQuestionStatus;
  error?: string;
  durationMs: number;
};

export type BatchReviewOptions = {
  action: ReviewAction;
  /** 명시적 GeneratedQuestion ID 목록 (--ids/--ids-file) */
  ids: string[];
  all?: boolean;
  limit: number | null;
  dryRun?: boolean;
  reviewer?: string;
  /** --all 대상 실행 시 요구되는 명시적 확인 (CLI flag 매핑) */
  confirmAll?: boolean;
};

export type BatchReviewDeps = {
  contentDb?: ContentDb;
  batchDb?: BatchContentDb;
  logger?: BatchLogger;
};

/** confirm flag가 필요한지 여부 (action별 판정은 CLI에서 flag 매핑) */
function confirmRequired(opts: BatchReviewOptions): boolean {
  return opts.all === true && opts.dryRun !== true && opts.confirmAll !== true;
}

export async function runBatchReview(
  opts: BatchReviewOptions,
  deps: BatchReviewDeps = {},
): Promise<BatchSummary<ReviewItemResult>> {
  const logger = deps.logger ?? createBatchLogger("batch-review");
  const contentDb = deps.contentDb ?? (await getDefaultContentDb());
  const batchDb = deps.batchDb ?? (await getDefaultBatchContentDb());

  if (confirmRequired(opts)) {
    throw new Error(
      "--all 대상 실행은 confirm flag(--i-am-sure-*-all-unchecked)가 필요합니다. dry-run으로 미리 확인하세요.",
    );
  }

  const startedAt = Date.now();

  // 대상 ID 결정: --all이면 QA_PASSED 전체 조회, 아니면 명시적 목록
  let ids: string[];
  let queried: { generatedQuestionId: string; status: GeneratedQuestionStatus }[] = [];
  if (opts.all === true) {
    const rows = await listGeneratedByStatus(batchDb, "QA_PASSED");
    queried = rows.map((r) => ({
      generatedQuestionId: r.id,
      status: r.status as GeneratedQuestionStatus,
    }));
    ids = queried.map((q) => q.generatedQuestionId);
  } else {
    ids = opts.ids;
  }

  const targetCount = resolveBatchScope(
    { limit: opts.limit, all: opts.all === true },
    ids.length,
  );
  ids = ids.slice(0, targetCount);

  if (opts.dryRun === true) {
    logger.info(
      `dry-run: 대상 ${ids.length}건, action=${opts.action} (상태 변경 없음)`,
    );
    for (let i = 0; i < ids.length; i += 1) {
      const q = queried.find((x) => x.generatedQuestionId === ids[i]);
      const status = q?.status ?? "(조회됨)";
      logger.progress(i + 1, ids.length, `${ids[i]} → ${opts.action} (${status})`);
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

  const results: ReviewItemResult[] = [];

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const itemStartedAt = Date.now();
    const q = queried.find((x) => x.generatedQuestionId === id);
    try {
      const outcome = await reviewGeneratedQuestion(
        contentDb,
        id,
        opts.action,
        opts.reviewer ?? "batch-cli",
      );
      const previous = q?.status ?? (await currentStatus(contentDb, id));
      const base = {
        generatedQuestionId: id,
        previousStatus: previous,
        status: outcome.status,
        durationMs: Date.now() - itemStartedAt,
      };
      if (outcome.alreadyResolved) {
        results.push({ ...base, outcome: "skipped" as const });
        logger.progress(i + 1, ids.length, `${id} → ${opts.action} (이미 반영됨)`);
      } else {
        results.push({
          ...base,
          outcome: (opts.action === "approve" ? "approved" : "rejected") as ReviewItemOutcome,
        });
        logger.progress(i + 1, ids.length, `${id} → ${opts.action} (${outcome.status})`);
      }
    } catch (error) {
      results.push({
        generatedQuestionId: id,
        outcome: "failed" as const,
        previousStatus: q?.status,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - itemStartedAt,
      });
      logger.progress(i + 1, ids.length, `${id} → failed`);
    }
  }

  const approved = results.filter((r) => r.outcome === "approved").length;
  const rejected = results.filter((r) => r.outcome === "rejected").length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const failed = results.filter((r) => r.outcome === "failed").length;

  return {
    total: ids.length,
    succeeded: approved + rejected,
    skipped,
    failed,
    results,
    durationMs: Date.now() - startedAt,
  };
}

async function currentStatus(
  db: ContentDb,
  id: string,
): Promise<GeneratedQuestionStatus | undefined> {
  const row = await db.generatedQuestion.findUnique({ where: { id } });
  return row ? (row.status as GeneratedQuestionStatus) : undefined;
}
