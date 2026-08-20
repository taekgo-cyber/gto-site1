// STEP 9 — batch-generate CLI (STEP 9 BUILD HANDOFF §2.9).
//
//   npm run cbt:batch-generate -- --limit=10
//   npm run cbt:batch-generate -- --all
//   npm run cbt:batch-generate -- --limit=10 --dry-run
//   npm run cbt:batch-generate -- --ids=uuid1,uuid2
//   npm run cbt:batch-generate -- --ids-file=./failed.txt
//   npm run cbt:batch-generate -- --category=CAT-HANDLING --limit=10
//   npm run cbt:batch-generate -- --resume=<runId>
//
// - (--limit | --all) 필수 (guard: 전체 실행 방지). --ids/--ids-file/--category는 대상 선택.
// - 명시 ID 선택 시 limit/all 없이도 가능 (범위가 명시적으로 제한됨).
// - 재진입: FAILED/QA_FAILED 상태의 GeneratedQuestion만 자동 재시도하고, 정상 GQ는 계속 스킵.
//   --force로 숫자를 억지로 채우지 않는다.
// - provider fail-closed preflight: API key/baseUrl/model가 유효하지 않으면
//   DB/LLM 쓰기 전에 실행을 거부한다. Mock 대체는 허용하지 않는다.
import "dotenv/config";
import { createBatchLogger } from "./batch/logger";
import { parseBatchArgs, parseLimit } from "./batch/args";
import { runBatchGenerate } from "./batch/generate";
import { createConfiguredProvider } from "./content/provider";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("batch-generate");

  const limit = parseLimit(args.values.get("limit"));
  const concurrency = args.values.get("concurrency");

  logger.info(
    `limit=${limit ?? "전체"} all=${args.flags.has("all")} ` +
      `ids=${args.values.get("ids") ?? "-"} ` +
      `idsFile=${args.values.get("ids-file") ?? "-"} ` +
      `category=${args.values.get("category") ?? "-"} ` +
      `resume=${args.values.get("resume") ?? "-"} ` +
      `dryRun=${args.flags.has("dry-run")} force=${args.flags.has("force")} ` +
      `llmFacts=${args.flags.has("llm-facts")}`,
  );

  // DB/LLM 쓰기 전 provider fail-closed preflight.
  // dry-run은 LLM/DB를 호출하지 않으므로 preflight 대상에서 제외한다.
  if (!args.flags.has("dry-run")) {
    createConfiguredProvider();
  }

  const summary = await runBatchGenerate({
    limit,
    all: args.flags.has("all"),
    ids: args.values.get("ids"),
    idsFile: args.values.get("ids-file"),
    category: args.values.get("category"),
    resume: args.values.get("resume"),
    dryRun: args.flags.has("dry-run"),
    force: args.flags.has("force"),
    concurrency: concurrency === undefined ? undefined : Number(concurrency),
    llmFacts: args.flags.has("llm-facts"),
  });

  if (args.flags.has("dry-run")) {
    logger.info(
      `dry-run 완료: 처리 대상 ${summary.total}건, 스킵 ${summary.skipped}건`,
    );
    return;
  }

  const statusCounts = new Map<string, number>();
  for (const r of summary.results) {
    if (r.status) {
      statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
    }
  }
  const distribution = [...statusCounts.entries()]
    .map(([status, count]) => `${status}=${count}`)
    .join(" ");
  logger.info(
    `완료: total=${summary.total} succeeded=${summary.succeeded} ` +
      `skipped=${summary.skipped} failed=${summary.failed} ` +
      `(${summary.durationMs}ms)`,
  );
  if (distribution) logger.info(`상태 분포: ${distribution}`);

  const failedIds = summary.results
    .filter((r) => r.outcome === "failed")
    .map((r) => r.candidateId);
  if (failedIds.length > 0) {
    logger.error(`실패 ${failedIds.length}건: ${failedIds.join(", ")}`);
    logger.info(
      `재진입: npm run cbt:batch-generate -- --resume=${summary.runId} ` +
        `(FAILED/QA_FAILED만 재시도, 정상 GQ는 스킵)`,
    );
  }

  if (summary.aborted) {
    logger.error(
      `중단 종료: aborted=${summary.aborted} abortReason=${summary.abortReason ?? "알 수 없음"}`,
    );
    process.exitCode = 1;
  } else if (summary.failed > 0 && summary.succeeded === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    "batch-generate 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});