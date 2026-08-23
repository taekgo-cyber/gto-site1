// STEP 9 — batch-generate orchestration (STEP 9 BUILD HANDOFF §2.7).
// Candidate 목록 → STEP 8 runContentProduction (fact extract + generation + QA) 배치 실행.
// 기존 runPool과 STEP 8 파이프라인을 재사용한다. 배치 레벨 retry는 추가하지 않는다.
// - dry-run: LLM 호출 0, DB 쓰기 0 (선택 결과 미리보기만).
// - 개별 건의 실패가 batch를 중단시키지 않는다 (failure isolation).
// - safety re-entry: FAILED/QA_FAILED 상태 GQ만 자동 재시도하고 정상 GQ는 스킵.
//   재시도는 마찬가지로 새 GeneratedQuestion 행을 append한다 (No Drop).
// - durable run log(Phase 0 D): runId JSONL을 열지 못하면 DB/LLM 쓰기 전 fail-closed로 거부.
// - circuit breaker(Phase 0 F): 연속 실패로 열리면 남은 항목을 circuit_open으로 단락한다.
import { CBT_BATCH_RUNS_DIR, CBT_LLM_CONCURRENCY } from "../config";
import { runPool } from "../pipeline/pool";
import { runContentProduction } from "../content/pipeline";
import { createConfiguredProvider } from "../content/provider";
import type { LlmProvider } from "../content/provider/types";
import type { ContentDb } from "../content/persist/content-repository";
import { getDefaultContentDb } from "../content/persist/content-repository";
import {
  getDefaultBatchDb,
  listGenerationTargets,
  type BatchCandidateDb,
} from "./candidate-query";
import { resolveBatchScope } from "./guard";
import { createBatchLogger, type BatchLogger } from "./logger";
import { parseIds, readIdsFile } from "./args";
import {
  createRunLogSession,
  readRunLog,
  type RunLogEntry,
  type RunLogSession,
} from "./runlog";
import { CircuitBreaker } from "./breaker";
import { isProviderTransient } from "./failure-classification";
import type { AbortReason, BatchSummary, GenerateItemResult } from "./types";

/** concurrency 상한 (실수로 지나치게 높은 값을 주지 않도록) */
const MAX_CONCURRENCY = 10;

/** circuit breaker 기본값: provider transient 연속 5회 → open, 최소 60초 쿨다운 */
const DEFAULT_PROVIDER_BREAKER_THRESHOLD = 5;
/** QA semantic 탈락 연속 10회 → open (provider 보다 관대) */
const DEFAULT_SEMANTIC_BREAKER_THRESHOLD = 10;
const DEFAULT_BREAKER_RESET_MS = 60_000;

/** transient(재시도 대상) LLM 실패 코드 → providerBreaker 실패로 계수 (terminal은 계수 금지) */
/** runContentProduction 결과를 기준으로 독립 breaker 2개를 갱신한다 */
export function classifyGenerationOutcome(
  status: string,
  errorCode: string | null,
  providerBreaker: CircuitBreaker,
  semanticBreaker: CircuitBreaker,
): void {
  // 1) transient LLM 실패 → providerBreaker 실패 (FAILED/QA_FAILED 무관)
  if (isProviderTransient(errorCode)) {
    providerBreaker.recordFailure();
    semanticBreaker.cancelProbe(); // semantic half_open 예약은 해제 (고착 방지)
    return;
  }
  // 2) 정상 provider 응답(errorCode null) → providerBreaker reset.
  //    - QA_PASSED → semanticBreaker reset
  //    - QA_FAILED(평가 탈락) → semanticBreaker 실패
  //    - 그 외 상태 → semanticBreaker half_open 예약 해제 (고착 방지)
  if (errorCode === null) {
    providerBreaker.recordSuccess();
    if (status === "QA_PASSED") {
      semanticBreaker.recordSuccess();
    } else if (status === "QA_FAILED") {
      semanticBreaker.recordFailure();
    } else {
      semanticBreaker.cancelProbe();
    }
    return;
  }
  // 3) 그 외 errorCode(terminal: http_client_error/schema_validation_failed/
  //    malformed_json/empty_response/content_invalid 등) → provider transient에
  //    계수하지 않고(reset하지도 않음) breaker에 영향을 주지 않는다.
  //    단, half_open으로 예약된 probe는 해제해 고착을 막는다.
  providerBreaker.cancelProbe();
  semanticBreaker.cancelProbe();
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export type BatchGenerateOptions = {
  limit: number | null;
  all?: boolean;
  /** 명시적 대상 ID CSV (--ids) */
  ids?: string;
  /** 대상 ID 파일 경로 (--ids-file, 줄 단위) */
  idsFile?: string;
  /** candidate.category 필터 (--category) */
  category?: string;
  /** 이전 runId 재진입 (--resume). 실패한 candidate만 자동 재시도 */
  resume?: string;
  dryRun?: boolean;
  force?: boolean;
  concurrency?: number;
  llmFacts?: boolean;
};

export type BatchGenerateDeps = {
  contentDb?: ContentDb;
  batchDb?: BatchCandidateDb;
  provider?: LlmProvider;
  logger?: BatchLogger;
  /** run log 디렉터리 (기본 CBT_BATCH_RUNS_DIR). 테스트 주입용 */
  runLogDir?: string;
  /** circuit breaker (기본 상수). providerBreaker alias로 호환 유지 (구 테스트) */
  breaker?: CircuitBreaker;
  /** provider transient 실패 breaker (기본 5). 분류 테스트에서 주입 */
  providerBreaker?: CircuitBreaker;
  /** QA semantic 탈락 breaker (기본 10). 분류 테스트에서 주입 */
  semanticBreaker?: CircuitBreaker;
  /** run log append 주입 (테스트 전용. mid-run 실패 시뮬레이션) */
  appendRunLog?: (dir: string, entry: RunLogEntry) => Promise<void>;
};

export async function runBatchGenerate(
  opts: BatchGenerateOptions,
  deps: BatchGenerateDeps = {},
): Promise<BatchSummary<GenerateItemResult>> {
  const logger = deps.logger ?? createBatchLogger("batch-generate");
  const batchDb = deps.batchDb ?? (await getDefaultBatchDb());
  const contentDb = deps.contentDb ?? (await getDefaultContentDb());
  const runLogDir = deps.runLogDir ?? CBT_BATCH_RUNS_DIR;

  // safety guard: resume(실패 항목만 재시도)와 force(전체 강제 재생성)는 재시도
  // 안전 정책이 충돌하므로 동시 사용을 거부한다. readRunLog/DB write/provider 전에 거부.
  if (opts.resume && opts.force) {
    throw new Error(
      "--resume과 --force는 함께 사용할 수 없습니다. resume은 실패 항목만 안전하게 재시도합니다.",
    );
  }

  // ------------------------------------------------------------------
  // 대상 선택: 명시 ID(ids/ids-file/resume) + category + limit/all guard
  // ------------------------------------------------------------------
  let explicitIds = dedupe(
    opts.ids ? parseIds(opts.ids) : [],
  );
  if (opts.idsFile) {
    explicitIds = dedupe([...explicitIds, ...(await readIdsFile(opts.idsFile))]);
  }
  if (opts.resume) {
    const previous = await readRunLog(runLogDir, opts.resume);
    if (previous.runStart.runType === "gate2_post_failure_recovery") {
      throw new Error("Gate 2 post-failure recovery run은 --resume source로 사용할 수 없습니다.");
    }
    explicitIds = dedupe([...explicitIds, ...previous.failedItemIds]);
    logger.info(
      `resume: runId=${opts.resume} 실패 재시도 ${previous.failedItemIds.length}건`,
    );
  }

  const selection = await listGenerationTargets(batchDb, {
    includeExisting: opts.force === true,
    ids: explicitIds.length > 0 ? explicitIds : undefined,
    category: explicitIds.length > 0 ? undefined : opts.category,
  });

  let targetCount: number;
  if (explicitIds.length > 0) {
    // 명시 ID 선택: 범위가 명시적으로 제한됨 → limit/all 불필요
    if (selection.targets.length === 0) {
      throw new Error("명시한 ID 중 대상 candidate가 없습니다. ID를 확인하세요.");
    }
    targetCount =
      opts.limit === null
        ? selection.targets.length
        : Math.min(opts.limit, selection.targets.length);
  } else {
    targetCount = resolveBatchScope(
      { limit: opts.limit, all: opts.all === true },
      selection.targets.length,
    );
  }
  const targets = selection.targets.slice(0, targetCount);
  const startedAt = Date.now();

  if (opts.dryRun === true) {
    const expectedCalls = targets.length * (opts.llmFacts === true ? 3 : 2);
    logger.info(`dry-run: 처리 대상 ${targets.length}건, 스킵 ${selection.skippedExisting}건`);
    logger.info(`dry-run: 예상 LLM 호출 수 ${expectedCalls} (LLM/DB 기록 없음)`);
    // 필터 적용 후 실제 대상 기준 카테고리 분포 (카테고리명 정렬)
    const perCategory = new Map<string, number>();
    for (const target of targets) {
      perCategory.set(target.category, (perCategory.get(target.category) ?? 0) + 1);
    }
    const distribution = [...perCategory.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([category, n]) => `${category}=${n}`)
      .join(" ");
    logger.info(`dry-run: 카테고리 분포 ${distribution}`);
    for (let i = 0; i < targets.length; i += 1) {
      logger.progress(i + 1, targets.length, `${targets[i].id} → 대상`);
    }
    return {
      total: targets.length,
      succeeded: 0,
      skipped: selection.skippedExisting,
      failed: 0,
      results: [],
      durationMs: Date.now() - startedAt,
    };
  }

  // fail-closed preflight: run log를 열 수 없으면 DB/LLM 쓰기를 시작하지 않는다.
  const concurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, opts.concurrency ?? CBT_LLM_CONCURRENCY),
  );
  const session: RunLogSession = await createRunLogSession({
    dir: runLogDir,
    command: "batch-generate",
    args: [
      ...(opts.ids ? [`--ids=${opts.ids}`] : []),
      ...(opts.idsFile ? [`--ids-file=${opts.idsFile}`] : []),
      ...(opts.category ? [`--category=${opts.category}`] : []),
      ...(opts.resume ? [`--resume=${opts.resume}`] : []),
      ...(opts.force ? ["--force"] : []),
      ...(opts.llmFacts ? ["--llm-facts"] : []),
      `--limit=${targets.length}`,
    ],
    targets: targets.map((t) => t.id),
    total: targets.length,
    concurrency,
    append: deps.appendRunLog,
  });
  logger.info(`runId: ${session.runId} (대상 ${targets.length}건, concurrency=${concurrency})`);

  const provider = deps.provider ?? createConfiguredProvider();
  logger.info(`provider: ${provider.provider} / ${provider.model}`);
  logger.info(
    `예상 LLM 호출 수: ${targets.length * (opts.llmFacts === true ? 3 : 2)}`,
  );

  const providerBreaker =
    deps.providerBreaker ??
    deps.breaker ??
    new CircuitBreaker({
      failureThreshold: DEFAULT_PROVIDER_BREAKER_THRESHOLD,
      resetTimeoutMs: DEFAULT_BREAKER_RESET_MS,
    });
  const semanticBreaker =
    deps.semanticBreaker ??
    new CircuitBreaker({
      failureThreshold: DEFAULT_SEMANTIC_BREAKER_THRESHOLD,
      resetTimeoutMs: DEFAULT_BREAKER_RESET_MS,
    });

  const results = await runPool(targets, concurrency, async (candidate) => {
    const itemStartedAt = Date.now();
    let result: GenerateItemResult;

    if (session.isBroken()) {
      // mid-run run log append 실패 → 신규 항목 스케줄링 중단 (LLM 호출 없음)
      result = {
        candidateId: candidate.id,
        outcome: "failed",
        error: "runlog_broken: run log 실패로 신규 항목 스케줄링 중단",
        durationMs: Date.now() - itemStartedAt,
      };
    } else {
      // 두 breaker의 probe 예약을 각각 구한 뒤, 한쪽만 허용되면 나머지 쪽의
      // 프로브를 취소한다 (half_open 고착 방지). 양쪽 closed면 no-op.
      const providerAllowed = providerBreaker.allowed();
      const semanticAllowed = semanticBreaker.allowed();
      if (!providerAllowed || !semanticAllowed) {
        if (providerAllowed) providerBreaker.cancelProbe();
        if (semanticAllowed) semanticBreaker.cancelProbe();
        result = {
          candidateId: candidate.id,
          outcome: "failed",
          error: "circuit_open: 연속 실패로 일시 중단 (breaker open)",
          durationMs: Date.now() - itemStartedAt,
        };
      } else {
        try {
          const outcome = await runContentProduction(
            { candidateId: candidate.id, llmFacts: opts.llmFacts },
            { db: contentDb, provider },
          );
          result = {
            candidateId: candidate.id,
            // FAILED/QA_FAILED는 생성 실패로 간주해 resume(DLQ) 대상에 포함시킨다.
            // generatedQuestionId/status는 감사용으로 보존한다.
            outcome:
              outcome.status === "FAILED" || outcome.status === "QA_FAILED"
                ? "failed"
                : "generated",
            generatedQuestionId: outcome.generatedQuestionId,
            status: outcome.status,
            error:
              outcome.status === "FAILED" || outcome.status === "QA_FAILED"
                ? (outcome.errorCode ?? `generation_failed: status=${outcome.status}`)
                : undefined,
            durationMs: Date.now() - itemStartedAt,
          };
          classifyGenerationOutcome(
            outcome.status,
            outcome.errorCode,
            providerBreaker,
            semanticBreaker,
          );
        } catch (error) {
          // DB/candidate/programming 오류 — provider transient가 아니므로 breaker 계수하지 않음.
          // half_open으로 예약된 probe는 해제해 고착을 막는다 (closed면 no-op).
          providerBreaker.cancelProbe();
          semanticBreaker.cancelProbe();
          result = {
            candidateId: candidate.id,
            outcome: "failed",
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - itemStartedAt,
          };
        }
      }
    }

    const appended = await session.appendItem(
      candidate.id,
      result.outcome === "generated" ? "succeeded" : "failed",
      result.error ?? result.status,
    );
    if (!appended) {
      // append failure(기록 실패 또는 broken 상태) → 감사 기록을 보존할 수 없으므로 실패 처리
      result = {
        candidateId: candidate.id,
        outcome: "failed",
        error: "runlog_append_failed: 항목 결과를 run log에 기록하지 못했습니다",
        durationMs: Date.now() - itemStartedAt,
      };
    }
    return result;
  });

  const failed = results.filter((r) => r.outcome === "failed").length;
  // 중단 종료: run log 손상이면 log_failure, circuit_open 단락이 하나라도 있으면 circuit_open
  const aborted = session.isBroken() || results.some((r) =>
    r.error?.includes("circuit_open"),
  );
  const abortReason: AbortReason | undefined = session.isBroken()
    ? "log_failure"
    : results.some((r) => r.error?.includes("circuit_open"))
      ? "circuit_open"
      : undefined;
  try {
    await session.finish(results.length - failed, failed, Date.now() - startedAt, {
      aborted,
      abortReason,
    });
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    throw err;
  }

  return {
    runId: session.runId,
    total: targets.length,
    succeeded: results.length - failed,
    skipped: selection.skippedExisting,
    failed,
    results,
    durationMs: Date.now() - startedAt,
    aborted,
    abortReason,
  };
}

export { MAX_CONCURRENCY };
