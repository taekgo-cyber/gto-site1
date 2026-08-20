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
import { createRunLogSession, type RunLogEntry } from "./runlog";
import { CBT_BATCH_RUNS_DIR } from "../config";
import type { AbortReason, BatchSummary } from "./types";

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
  /** run log 디렉터리 (기본 CBT_BATCH_RUNS_DIR). 테스트 주입용 */
  runLogDir?: string;
  /** run log append 주입 (테스트 전용. mid-run 실패 시뮬레이션) */
  appendRunLog?: (dir: string, entry: RunLogEntry) => Promise<void>;
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
  const runLogDir = deps.runLogDir ?? CBT_BATCH_RUNS_DIR;

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

  // fail-closed preflight: run log를 열 수 없으면 상태 write를 시작하지 않는다.
  const session = await createRunLogSession({
    dir: runLogDir,
    command: "batch-review",
    args: [
      `--action=${opts.action}`,
      ...(opts.all ? ["--all"] : ids.map((id) => `--ids=${id}`)),
      `--limit=${ids.length}`,
      "--concurrency=1",
    ],
    targets: ids,
    total: ids.length,
    concurrency: 1,
    append: deps.appendRunLog,
  });
  logger.info(`runId: ${session.runId} (대상 ${ids.length}건)`);

  const results: ReviewItemResult[] = [];

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const itemStartedAt = Date.now();

    if (session.isBroken()) {
      results.push({
        generatedQuestionId: id,
        outcome: "failed",
        error: "runlog_broken: run log 실패로 신규 항목 스케줄링 중단",
        durationMs: Date.now() - itemStartedAt,
      });
      logger.progress(i + 1, ids.length, `${id} → runlog_broken (중단)`);
      break;
    }

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
        const appended = await session.appendItem(id, "succeeded", `${opts.action} (이미 반영됨)`);
        if (!appended) {
          // append failure → 감사 기록 보존 불가. 해당 항목 실패·broken 반영 후 중단
          results[results.length - 1] = {
            generatedQuestionId: id,
            outcome: "failed" as const,
            previousStatus: previous,
            error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
            durationMs: Date.now() - itemStartedAt,
          };
          logger.progress(i + 1, ids.length, `${id} → runlog_append_failed (중단)`);
          break;
        }
        logger.progress(i + 1, ids.length, `${id} → ${opts.action} (이미 반영됨)`);
      } else {
        results.push({
          ...base,
          outcome: (opts.action === "approve" ? "approved" : "rejected") as ReviewItemOutcome,
        });
        const appended = await session.appendItem(id, "succeeded", `${opts.action} (${outcome.status})`);
        if (!appended) {
          // append failure → 감사 기록 보존 불가. 해당 항목 실패·broken 반영 후 중단
          results[results.length - 1] = {
            generatedQuestionId: id,
            outcome: "failed" as const,
            previousStatus: previous,
            error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
            durationMs: Date.now() - itemStartedAt,
          };
          logger.progress(i + 1, ids.length, `${id} → runlog_append_failed (중단)`);
          break;
        }
        logger.progress(i + 1, ids.length, `${id} → ${opts.action} (${outcome.status})`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        generatedQuestionId: id,
        outcome: "failed" as const,
        previousStatus: q?.status,
        error: detail,
        durationMs: Date.now() - itemStartedAt,
      });
      const appended = await session.appendItem(id, "failed", detail);
      if (!appended) {
        // append failure → 감사 기록 보존 불가. 해당 항목 실패·broken 반영 후 중단
        results[results.length - 1] = {
          generatedQuestionId: id,
          outcome: "failed" as const,
          previousStatus: q?.status,
          error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
          durationMs: Date.now() - itemStartedAt,
        };
        logger.progress(i + 1, ids.length, `${id} → runlog_append_failed (중단)`);
        break;
      }
      logger.progress(i + 1, ids.length, `${id} → failed`);
    }
  }

  const approved = results.filter((r) => r.outcome === "approved").length;
  const rejected = results.filter((r) => r.outcome === "rejected").length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const failed = results.filter((r) => r.outcome === "failed").length;

  // 중단 종료: run log 손상이면 log_failure
  const aborted = session.isBroken();
  const abortReason: AbortReason | undefined = aborted ? "log_failure" : undefined;

  // finish는 항목 기록이 깨졌으면 throw한다 (fail-closed)
  // 처리 건수: approved+rejected+alreadyResolved skipped 모두 item_result는 succeeded로 기록됨
  await session.finish(
    approved + rejected + skipped,
    failed,
    Date.now() - startedAt,
    { aborted, abortReason },
  );

  return {
    runId: session.runId,
    total: ids.length,
    succeeded: approved + rejected,
    skipped,
    failed,
    results,
    durationMs: Date.now() - startedAt,
    aborted,
    abortReason,
  };
}

async function currentStatus(
  db: ContentDb,
  id: string,
): Promise<GeneratedQuestionStatus | undefined> {
  const row = await db.generatedQuestion.findUnique({ where: { id } });
  return row ? (row.status as GeneratedQuestionStatus) : undefined;
}
