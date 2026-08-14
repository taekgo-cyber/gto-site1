// STEP 9 — batch-generate orchestration (STEP 9 BUILD HANDOFF §2.7).
// Candidate 목록 → STEP 8 runContentProduction (fact extract + generation + QA) 배치 실행.
// 기존 runPool과 STEP 8 파이프라인을 재사용한다. 배치 레벨 retry는 추가하지 않는다.
// - dry-run: LLM 호출 0, DB 쓰기 0 (선택 결과 미리보기만).
// - 개별 건의 실패가 batch를 중단시키지 않는다 (failure isolation).
// - idempotency: 기존 GeneratedQuestion 보유 candidate는 기본 제외 (force 시 재생성).
import { CBT_LLM_CONCURRENCY } from "../config";
import { runPool } from "../pipeline/pool";
import { runContentProduction } from "../content/pipeline";
import { createDefaultProvider } from "../content/provider";
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
import type { BatchSummary, GenerateItemResult } from "./types";

/** concurrency 상한 (실수로 지나치게 높은 값을 주지 않도록) */
const MAX_CONCURRENCY = 10;

export type BatchGenerateOptions = {
  limit: number | null;
  all?: boolean;
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
};

export async function runBatchGenerate(
  opts: BatchGenerateOptions,
  deps: BatchGenerateDeps = {},
): Promise<BatchSummary<GenerateItemResult>> {
  const logger = deps.logger ?? createBatchLogger("batch-generate");
  const batchDb = deps.batchDb ?? (await getDefaultBatchDb());
  const contentDb = deps.contentDb ?? (await getDefaultContentDb());

  const selection = await listGenerationTargets(batchDb, {
    includeExisting: opts.force === true,
  });
  const targetCount = resolveBatchScope(
    { limit: opts.limit, all: opts.all === true },
    selection.targets.length,
  );
  const targets = selection.targets.slice(0, targetCount);
  const startedAt = Date.now();

  if (opts.dryRun === true) {
    const expectedCalls = targets.length * (opts.llmFacts === true ? 3 : 2);
    logger.info(`dry-run: 처리 대상 ${targets.length}건, 스킵 ${selection.skippedExisting}건`);
    logger.info(`dry-run: 예상 LLM 호출 수 ${expectedCalls} (LLM/DB 기록 없음)`);
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

  const provider = deps.provider ?? createDefaultProvider();
  logger.info(`provider: ${provider.provider} / ${provider.model}`);
  logger.info(
    `예상 LLM 호출 수: ${targets.length * (opts.llmFacts === true ? 3 : 2)}`,
  );

  const concurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, opts.concurrency ?? CBT_LLM_CONCURRENCY),
  );
  const results = await runPool(targets, concurrency, async (candidate) => {
    const itemStartedAt = Date.now();
    try {
      const outcome = await runContentProduction(
        { candidateId: candidate.id, llmFacts: opts.llmFacts },
        { db: contentDb, provider },
      );
      return {
        candidateId: candidate.id,
        outcome: "generated" as const,
        generatedQuestionId: outcome.generatedQuestionId,
        status: outcome.status,
        durationMs: Date.now() - itemStartedAt,
      };
    } catch (error) {
      return {
        candidateId: candidate.id,
        outcome: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - itemStartedAt,
      };
    }
  });

  const failed = results.filter((r) => r.outcome === "failed").length;
  return {
    total: targets.length,
    succeeded: results.length - failed,
    skipped: selection.skippedExisting,
    failed,
    results,
    durationMs: Date.now() - startedAt,
  };
}

export { MAX_CONCURRENCY };