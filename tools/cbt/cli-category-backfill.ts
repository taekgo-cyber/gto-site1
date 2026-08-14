// STEP 10-4 — NEWBT 카테고리 분류 백필 CLI.
//
//   npm run cbt:category-backfill -- --source=NEWBT-HWMUL --all --dry-run
//   npm run cbt:category-backfill -- --source=NEWBT-HWMUL --all
//
// 전수 감사로 확정한 배정표(NEWBT_CATEGORY_ASSIGNMENTS)에 따라
// candidate의 category를 갱신한다. dry-run은 DB 기록 없이 대상만 출력.
import "dotenv/config";
import { createBatchLogger } from "./batch/logger";
import { parseBatchArgs, parseLimit } from "./batch/args";
import { runCategoryBackfill } from "./batch/category-backfill";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("category-backfill");

  const sourceName = args.values.get("source");
  if (!sourceName) throw new Error("--source=<name> 이 필요합니다.");

  const limit = parseLimit(args.values.get("limit"));

  logger.info(
    `source=${sourceName} limit=${limit ?? "전체"} ` +
      `all=${args.flags.has("all")} dryRun=${args.flags.has("dry-run")}`,
  );

  const summary = await runCategoryBackfill(
    {
      sourceName,
      limit,
      all: args.flags.has("all"),
      dryRun: args.flags.has("dry-run"),
    },
    { logger },
  );

  logger.info(
    `완료: total=${summary.total} applied=${summary.applied} ` +
      `skipped=${summary.skipped} (${summary.durationMs}ms)`,
  );
}

main().catch((err) => {
  console.error(
    "category-backfill 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
