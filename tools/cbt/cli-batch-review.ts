// STEP 10 — batch-review CLI (STEP 10 PLAN §6.3).
//
//   npm run cbt:batch-review -- --action=approve --ids=a,b,c --reviewer=taekg
//   npm run cbt:batch-review -- --action=reject --ids-file=path
//   npm run cbt:batch-review -- --action=approve --all --i-am-sure-to-approve-all-unchecked
//   npm run cbt:batch-review -- --action=approve --all --dry-run
//
// - --action=approve|reject 필수. (--ids | --ids-file | --all) 중 하나 필수.
// - --all + 실제 실행 시 confirm flag 필수 (dry-run 제외).
// - 개별 실패는 그대로 기록되고 batch가 중단되지 않는다.
import "dotenv/config";
import { parseBatchArgs, parseIds, parseLimit, readIdsFile } from "./batch/args";
import { createBatchLogger } from "./batch/logger";
import { runBatchReview, type ReviewAction } from "./batch/review";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("batch-review");

  const actionRaw = args.values.get("action");
  if (actionRaw !== "approve" && actionRaw !== "reject") {
    throw new Error("--action=approve|reject 가 필요합니다.");
  }
  const action: ReviewAction = actionRaw;

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

  // --all safety guard: action별 confirm flag 요구 (dry-run은 쓰기가 없어 면제)
  const confirmAll =
    args.flags.has("i-am-sure-to-approve-all-unchecked") ||
    args.flags.has("i-am-sure-to-reject-all-unchecked");

  const dryRun = args.flags.has("dry-run");
  const reviewer = args.values.get("reviewer") ?? undefined;
  const limit = parseLimit(args.values.get("limit"));

  logger.info(
    `action=${action} ids=${ids.length} all=${all} dryRun=${dryRun} ` +
      `limit=${limit ?? "전체"} reviewer=${reviewer ?? "batch-cli"}`,
  );

  const summary = await runBatchReview(
    {
      action,
      ids,
      all,
      limit,
      dryRun,
      reviewer,
      confirmAll,
    },
    {},
  );

  if (dryRun) {
    logger.info(
      `dry-run 완료: 대상 ${summary.total}건 (상태 변경 없음)`,
    );
    return;
  }

  logger.info(
    `완료: total=${summary.total} approved/rejected=${summary.succeeded} ` +
      `skipped=${summary.skipped} failed=${summary.failed} (${summary.durationMs}ms)`,
  );

  const failedIds = summary.results
    .filter((r) => r.outcome === "failed")
    .map((r) => r.generatedQuestionId);
  if (failedIds.length > 0) {
    logger.error(`실패 ${failedIds.length}건: ${failedIds.join(", ")}`);
    logger.info("개별 재실행: npm run cbt:review -- --id=<uuid> --approve|--reject");
  }

  if (summary.failed > 0 && summary.succeeded === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    "batch-review 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
