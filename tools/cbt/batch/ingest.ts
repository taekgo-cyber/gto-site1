// STEP 9 — batch-ingest orchestration (STEP 9 BUILD HANDOFF §2.6).
// Source ID 목록 → STEP 3 Collector → STEP 4 Extractor → STEP 5 Normalizer → STEP 6 Persist.
// 기존 모듈을 import하여 호출만 한다 (STEP 1~8 코드는 수정하지 않는다).
// - ingest는 순차 처리 (collector 의도적 직렬 설계 + rate limit 준수).
// - 개별 건의 실패가 batch를 중단시키지 않는다 (failure isolation).
// - dry-run: DB persist를 생략하고 raw 캐시만 허용한다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CBT_BATCH_RUNS_DIR, CBT_RAW_DIR } from "../config";
import {
  buildQuestionUrl,
  collectSourceId,
  RequestRateLimiter,
  DEFAULT_REQUEST_INTERVAL_MS,
} from "../collector/fetch-source";
import type { CbtSourceDef } from "../sources.config";
import { extractNewbtQuestion } from "../extractor/dom-extract-newbt";
import { normalizeQuestion } from "../normalizer/normalize-question";
import { persistCandidateQuestion } from "../persist/persist-candidate";
import type { CandidateDb } from "../persist/candidate-repository";
import type { SnippetStorage } from "../persist/snippet-storage";
import { resolveBatchScope } from "./guard";
import { createBatchLogger, type BatchLogger } from "./logger";
import { createRunLogSession, type RunLogEntry } from "./runlog";
import type { AbortReason, BatchSummary, IngestItemResult } from "./types";

export type BatchIngestOptions = {
  source: CbtSourceDef;
  ids: string[];
  limit: number | null;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  intervalMs?: number;
};

export type BatchIngestDeps = {
  db?: CandidateDb;
  storage?: SnippetStorage;
  /** raw 저장 루트 (기본: config.CBT_RAW_DIR) */
  rawDir?: string;
  logger?: BatchLogger;
  /** run log 디렉터리 (기본 CBT_BATCH_RUNS_DIR). 테스트 주입용 */
  runLogDir?: string;
  /** run log append 주입 (테스트 전용. mid-run 실패 시뮬레이션) */
  appendRunLog?: (dir: string, entry: RunLogEntry) => Promise<void>;
};

export async function runBatchIngest(
  opts: BatchIngestOptions,
  deps: BatchIngestDeps = {},
): Promise<BatchSummary<IngestItemResult>> {
  const logger = deps.logger ?? createBatchLogger("batch-ingest");
  const rawDir = deps.rawDir ?? CBT_RAW_DIR;
  const runLogDir = deps.runLogDir ?? CBT_BATCH_RUNS_DIR;
  const limiter = new RequestRateLimiter(
    opts.intervalMs ?? DEFAULT_REQUEST_INTERVAL_MS,
  );

  const startedAt = Date.now();
  const targetCount = resolveBatchScope(
    { limit: opts.limit, all: opts.all === true },
    opts.ids.length,
  );
  const ids = opts.ids.slice(0, targetCount);

  if (opts.dryRun === true) {
    logger.info(`dry-run: 대상 ${ids.length}건 (수집/저장 없이 검증)`);
    return {
      total: ids.length,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      results: [],
      durationMs: Date.now() - startedAt,
    };
  }

  // fail-closed preflight: run log를 열 수 없으면 DB write를 시작하지 않는다.
  const session = await createRunLogSession({
    dir: runLogDir,
    command: "batch-ingest",
    args: [
      `--source=${opts.source.sourceName}`,
      `--ids=${ids.join(",")}`,
      "--concurrency=1",
      ...(opts.force ? ["--force"] : []),
    ],
    targets: ids,
    total: ids.length,
    concurrency: 1,
    append: deps.appendRunLog,
  });
  logger.info(`runId: ${session.runId} (대상 ${ids.length}건)`);

  const results: IngestItemResult[] = [];

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const itemStartedAt = Date.now();

    if (session.isBroken()) {
      results.push({
        sourceQuestionId: id,
        outcome: "failed",
        error: "runlog_broken: run log 실패로 신규 항목 스케줄링 중단",
        durationMs: Date.now() - itemStartedAt,
      });
      logger.progress(i + 1, ids.length, `${id} → runlog_broken (중단)`);
      break;
    }

    try {
      const collect = await collectSourceId(
        opts.source,
        id,
        { force: opts.force === true, rawDir },
        limiter,
      );

      if (collect.kind === "failed") {
        const detail =
          collect.error instanceof Error
            ? collect.error.message
            : String(collect.error);
        results.push({
          sourceQuestionId: id,
          outcome: "failed",
          error: detail,
          durationMs: Date.now() - itemStartedAt,
        });
        const appended = await session.appendItem(id, "failed", detail);
        if (!appended) {
          // append failure → 감사 기록 보존 불가. 해당 항목 실패·broken 반영 후 중단
          results[results.length - 1] = {
            sourceQuestionId: id,
            outcome: "failed",
            error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
            durationMs: Date.now() - itemStartedAt,
          };
          logger.progress(i + 1, ids.length, `${id} → runlog_append_failed (중단)`);
          break;
        }
        logger.progress(i + 1, ids.length, `${id} → failed`);
        continue;
      }

      // raw HTML은 기존 raw 저장소에서 읽는다 (Na Drop — 원본 보존)
      const rawPath = path.join(
        rawDir,
        opts.source.sourceName,
        `${id}.html`,
      );
      const html = await readFile(rawPath);

      const url = buildQuestionUrl(opts.source, id);
      const baseUrl = url ? new URL(url).origin : null;

      const extracted = extractNewbtQuestion({
        html,
        sourceName: opts.source.sourceName,
        sourceQuestionId: id,
        baseUrl,
        sourceRef: collect.source,
      });
      const normalized = normalizeQuestion(extracted);

      const persisted = await persistCandidateQuestion(
        { question: normalized, rawHtmlSnippet: extracted.rawHtmlSnippet },
        { db: deps.db, storage: deps.storage },
      );
      results.push({
        sourceQuestionId: id,
        outcome: "persisted",
        candidateId: persisted.candidateId,
        created: persisted.created,
        validationStatus: normalized.validationStatus,
        durationMs: Date.now() - itemStartedAt,
      });
      const appended = await session.appendItem(
        id,
        "succeeded",
        `persisted (${normalized.validationStatus})`,
      );
      if (!appended) {
        // append failure → 감사 기록 보존 불가. 해당 항목 실패·broken 반영 후 중단
        results[results.length - 1] = {
          sourceQuestionId: id,
          outcome: "failed",
          error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
          durationMs: Date.now() - itemStartedAt,
        };
        logger.progress(i + 1, ids.length, `${id} → runlog_append_failed (중단)`);
        break;
      }
      logger.progress(
        i + 1,
        ids.length,
        `${id} → persisted (${normalized.validationStatus})`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        sourceQuestionId: id,
        outcome: "failed",
        error: detail,
        durationMs: Date.now() - itemStartedAt,
      });
      const appended = await session.appendItem(id, "failed", detail);
      if (!appended) {
        // append failure → 감사 기록 보존 불가. 해당 항목 실패·broken 반영 후 중단
        results[results.length - 1] = {
          sourceQuestionId: id,
          outcome: "failed",
          error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
          durationMs: Date.now() - itemStartedAt,
        };
        logger.progress(i + 1, ids.length, `${id} → runlog_append_failed (중단)`);
        break;
      }
      logger.progress(i + 1, ids.length, `${id} → failed`);
    }
  }

  const succeeded = results.filter(
    (r) => r.outcome === "persisted" || r.outcome === "collected",
  ).length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const failed = results.filter((r) => r.outcome === "failed").length;

  // 중단 종료: run log 손상이면 log_failure
  const aborted = session.isBroken();
  const abortReason: AbortReason | undefined = aborted ? "log_failure" : undefined;

  // finish는 항목 기록이 깨졌으면 throw한다 (fail-closed)
  await session.finish(succeeded, failed, Date.now() - startedAt, {
    aborted,
    abortReason,
  });

  return {
    runId: session.runId,
    total: ids.length,
    succeeded,
    skipped,
    failed,
    results,
    durationMs: Date.now() - startedAt,
    aborted,
    abortReason,
  };
}