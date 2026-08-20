// STEP 9 — batch-ingest CLI (STEP 9 BUILD HANDOFF §2.8).
//
//   npm run cbt:batch-ingest -- --source=NEWBT-HWMUL --ids=a,b,c --limit=10
//   npm run cbt:batch-ingest -- --source=NEWBT-HWMUL --ids-file=path --all
//   npm run cbt:batch-ingest -- --source=NEWBT-HWMUL --ids=a,b,c --limit=10 --dry-run
//
// - --source, (--ids | --ids-file), (--limit | --all) 필수.
// - 실제 수집 URL이 확정되지 않은(planned) source는 거부한다.
// - 개별 실패는 그대로 기록되고 batch가 중단되지 않는다.
// - 마지막에 실패 ID를 재실행 명령으로 안내한다.
import "dotenv/config";
import { CBT_SOURCES, isSourceCollectable } from "./sources.config";
import {
  createBatchLogger,
} from "./batch/logger";
import {
  parseBatchArgs,
  parseIds,
  parseLimit,
  readIdsFile,
} from "./batch/args";
import { runBatchIngest } from "./batch/ingest";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("batch-ingest");

  const sourceName = args.values.get("source");
  if (!sourceName) throw new Error("--source=<name> 이 필요합니다.");

  const source = CBT_SOURCES.find((s) => s.sourceName === sourceName);
  if (!source) throw new Error(`source 설정 없음: ${sourceName}`);
  if (!isSourceCollectable(source)) {
    throw new Error(
      `수집 불가: ${sourceName} (urlTemplate 미확정, status=${source.status})`,
    );
  }

  const idsFlag = args.values.get("ids");
  const idsFile = args.values.get("ids-file");
  if ((idsFlag && idsFile) || (!idsFlag && !idsFile)) {
    throw new Error("--ids 또는 --ids-file 중 정확히 하나를 지정해야 합니다.");
  }
  const ids = idsFlag ? parseIds(idsFlag) : await readIdsFile(idsFile as string);
  if (ids.length === 0) throw new Error("처리할 ID가 없습니다 (빈 목록).");

  const limit = parseLimit(args.values.get("limit"));

  logger.info(
    `source=${source.sourceName} ids=${ids.length}건 ` +
      `limit=${limit ?? "전체"} all=${args.flags.has("all")} ` +
      `dryRun=${args.flags.has("dry-run")} force=${args.flags.has("force")}`,
  );

  const summary = await runBatchIngest({
    source,
    ids,
    limit,
    all: args.flags.has("all"),
    dryRun: args.flags.has("dry-run"),
    force: args.flags.has("force"),
  });

  logger.info(
    `완료: runId=${summary.runId ?? "-"} total=${summary.total} ` +
      `persisted=${summary.succeeded} ` +
      `skipped=${summary.skipped} failed=${summary.failed} ` +
      `(${summary.durationMs}ms)`,
  );

  const failedIds = summary.results
    .filter((r) => r.outcome === "failed")
    .map((r) => r.sourceQuestionId);
  if (failedIds.length > 0) {
    logger.error(`실패 ${failedIds.length}건: ${failedIds.join(", ")}`);
    logger.info(
      `재실행: npm run cbt:batch-ingest -- --source=${source.sourceName} ` +
        `--ids=${failedIds.join(",")} --limit=${failedIds.length}`,
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
    "batch-ingest 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});