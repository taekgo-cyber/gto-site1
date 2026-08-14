// STEP 9 — batch-generate CLI (STEP 9 BUILD HANDOFF §2.9).
//
//   npm run cbt:batch-generate -- --limit=10
//   npm run cbt:batch-generate -- --all
//   npm run cbt:batch-generate -- --limit=10 --dry-run
//
// - (--limit | --all) 필수.
// - dry-run: LLM/DB 호출 없이 대상 목록만 출력한다.
// - 개별 실패는 그대로 기록되고 batch가 중단되지 않는다.
// - 개별 재실행은 기존 단건 명령(cbt:generate)으로 안내한다.
import "dotenv/config";
import { createBatchLogger } from "./batch/logger";
import { parseBatchArgs, parseLimit } from "./batch/args";
import { runBatchGenerate } from "./batch/generate";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("batch-generate");

  const limit = parseLimit(args.values.get("limit"));
  const concurrency = args.values.get("concurrency");

  logger.info(
    `limit=${limit ?? "전체"} all=${args.flags.has("all")} ` +
      `dryRun=${args.flags.has("dry-run")} force=${args.flags.has("force")} ` +
      `llmFacts=${args.flags.has("llm-facts")}`,
  );

  const summary = await runBatchGenerate({
    limit,
    all: args.flags.has("all"),
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
      "개별 재실행: npm run cbt:generate -- --candidateId=<uuid>",
    );
  }

  if (summary.failed > 0 && summary.succeeded === 0) {
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