// STEP 10 — batch-promote CLI (STEP 10 PLAN §7.3).
//
//   npm run cbt:batch-promote -- --all --dry-run
//   npm run cbt:batch-promote -- --limit=10
//   npm run cbt:batch-promote -- --ids=a,b,c --concurrency=3
//
// - (--ids | --ids-file | --all) 중 하나 + 스코프(--limit | --all) 필수.
// - APPROVED GeneratedQuestion만 승격 대상 (promoteToMaster가 방어).
// - 건별 transaction + runPool(기본 3, 최대 10) + failure isolation.
// - dry-run: DB 변경 없이 대상 목록만 출력.
import "dotenv/config";
import { parseBatchArgs, parseIds, parseLimit, readIdsFile } from "./batch/args";
import { createBatchLogger } from "./batch/logger";
import { runBatchPromote } from "./batch/promote";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("batch-promote");

  const ids = parseIds(args.values.get("ids"));
  const idsFile = args.values.get("ids-file");
  if (idsFile) {
    ids.push(...(await readIdsFile(idsFile)));
  }

  const all = args.flags.has("all");
  if (ids.length === 0 && !all) {
    throw new Error("(--ids | --ids-file | --all) 중 하나가 필요합니다.");
  }
  if (ids.length > 0 && all) {
    throw new Error("--ids/--ids-file 과 --all 은 동시에 지정할 수 없습니다.");
  }

  const limit = parseLimit(args.values.get("limit"));
  const dryRun = args.flags.has("dry-run");
  const concurrencyRaw = args.values.get("concurrency");

  logger.info(
    `ids=${ids.length} all=${all} limit=${limit ?? "전체"} ` +
      `dryRun=${dryRun} concurrency=${concurrencyRaw ?? "기본 3"}`,
  );

  const summary = await runBatchPromote(
    {
      ids,
      all,
      limit,
      dryRun,
      concurrency:
        concurrencyRaw === undefined ? undefined : Number(concurrencyRaw),
    },
    {},
  );

  if (dryRun) {
    logger.info(`dry-run 완료: 승격 대상 ${summary.total}건 (DB 변경 없음)`);
    return;
  }

  logger.info(
    `완료: total=${summary.total} promoted=${summary.succeeded} ` +
      `skipped=${summary.skipped} failed=${summary.failed} (${summary.durationMs}ms)`,
  );

  const failedIds = summary.results
    .filter((r) => r.outcome === "failed")
    .map((r) => r.generatedQuestionId);
  if (failedIds.length > 0) {
    logger.error(`실패 ${failedIds.length}건: ${failedIds.join(", ")}`);
    logger.info("개별 재실행: npm run cbt:promote -- --id=<uuid>");
  }

  if (summary.failed > 0 && summary.succeeded === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    "batch-promote 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
