// STEP 10-2 — NEWBT 정답 백필 CLI.
//
//   npm run cbt:answer-fetch -- --source=NEWBT-HWMUL --limit=10
//   npm run cbt:answer-fetch -- --source=NEWBT-HWMUL --all
//   npm run cbt:answer-fetch -- --source=NEWBT-HWMUL --ids=92628,92629 --dry-run
//
// 목적: HTML에 정답이 없는 newbt.kr 원천에 대해, 공개 examples API에서
// 정답(is_answer)을 조회해 CandidateQuestion.normalizedAnswers를 채운다.
// - 정답 백필은 후보의 수집 데이터를 "완성"하는 것으로, 별도 명시적 도구에서만 수행한다.
// - dry-run: API 호출 없이 대상만 출력한다.
// - 백필 성공 시 validationErrors에서 answer_missing/answer_unparseable을 제거하고
//   validationStatus를 VALID로 갱신한다 (그 외 오류는 보존).
// - 개별 실패가 batch를 중단시키지 않는다 (No Drop / failure isolation).
import "dotenv/config";
import { createBatchLogger } from "./batch/logger";
import { parseBatchArgs, parseIds, parseLimit, readIdsFile } from "./batch/args";
import { runAnswerBackfill, type AnswerBackfillOptions } from "./batch/answer-backfill";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const logger = createBatchLogger("answer-fetch");

  const sourceName = args.values.get("source");
  if (!sourceName) throw new Error("--source=<name> 이 필요합니다.");

  const idsFile = args.values.get("ids-file");
  const ids = idsFile
    ? await readIdsFile(idsFile)
    : parseIds(args.values.get("ids"));
  const limit = parseLimit(args.values.get("limit"));

  logger.info(
    `source=${sourceName} ids=${ids.length}건 ` +
      `limit=${limit ?? "전체"} all=${args.flags.has("all")} ` +
      `dryRun=${args.flags.has("dry-run")}`,
  );

  const opts: AnswerBackfillOptions = {
    sourceName,
    ids: ids.length > 0 ? ids : undefined,
    limit,
    all: args.flags.has("all"),
    dryRun: args.flags.has("dry-run"),
  };

  const summary = await runAnswerBackfill(opts, { logger });

  if (args.flags.has("dry-run")) {
    logger.info(
      `dry-run 완료: 대상 ${summary.total}건 (API/DB 기록 없음)`,
    );
    return;
  }

  logger.info(
    `완료: total=${summary.total} backfilled=${summary.backfilled} ` +
      `skipped=${summary.skipped} failed=${summary.failed} ` +
      `(${summary.durationMs}ms)`,
  );

  if (summary.failed > 0 && summary.backfilled === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    "answer-fetch 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});