// STEP 10 — Dataset Audit CLI (STEP 10 PLAN §8.4).
//
//   npm run cbt:dataset-audit
//
// - 완전한 read-only. DB 쓰기 없음.
// - error 레벨 finding이 1건 이상이면 exit code 1.
// - warning은 보고만 하고 exit code에 영향 주지 않는다.
import "dotenv/config";
import { hasErrors, runDatasetAudit } from "./batch/audit";
import { createBatchLogger } from "./batch/logger";

async function main(): Promise<void> {
  const logger = createBatchLogger("dataset-audit");

  const report = await runDatasetAudit();

  logger.info(
    `MasterQuestion: ${report.totalMasters}건 ` +
      `(비활성 ${report.inactiveMasters}, 승격 누락 APPROVED ${report.approvedNotPromoted})`,
  );
  const categorySummary = Object.entries(report.byCategory)
    .map(([cat, count]) => `${cat}=${count}`)
    .join(" ");
  const difficultySummary = Object.entries(report.byDifficulty)
    .map(([d, count]) => `${d}=${count}`)
    .join(" ");
  if (categorySummary) logger.info(`category 분포: ${categorySummary}`);
  if (difficultySummary) logger.info(`difficulty 분포: ${difficultySummary}`);

  const errors = report.findings.filter((f) => f.level === "error");
  const warnings = report.findings.filter((f) => f.level === "warning");

  for (const f of errors) {
    logger.error(`[error] ${f.code}: ${f.message}`);
  }
  for (const f of warnings) {
    logger.warn(`[warning] ${f.code}: ${f.message}`);
  }

  logger.info(
    `검사 완료: error=${errors.length} warning=${warnings.length}`,
  );

  if (hasErrors(report)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    "dataset-audit 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
