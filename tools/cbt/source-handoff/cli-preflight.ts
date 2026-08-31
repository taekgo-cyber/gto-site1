import "dotenv/config";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStagingTargetBoundary } from "./boundary";
import { assertKnownPairs, expectedMigrationNames, valueAfter } from "./cli-shared";
import { planCbtSourceImportV1 } from "./preflight";
import { createPrismaSourceImportDatabase } from "./prisma-repository";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  assertKnownPairs(argv, new Set(["--bundle", "--report"]));
  const bundlePathRaw = valueAfter(argv, "--bundle");
  if (!bundlePathRaw) throw new Error("cbt_source_preflight_bundle_required");
  const bundle = JSON.parse(await readFile(path.resolve(bundlePathRaw), "utf8")) as unknown;
  const boundary = assertStagingTargetBoundary();
  const database = createPrismaSourceImportDatabase();
  try {
    const plan = await planCbtSourceImportV1({
      repository: database,
      bundle,
      target: {
        project: boundary.project,
        environment: boundary.environment,
        service: boundary.service,
      },
      expectedMigrationNames: await expectedMigrationNames(),
    });
    const report = valueAfter(argv, "--report");
    if (report) {
      const reportPath = path.resolve(report);
      if (!(await stat(path.dirname(reportPath))).isDirectory()) {
        throw new Error("cbt_source_report_parent_invalid");
      }
      await writeFile(reportPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    }
    console.log(JSON.stringify(plan, null, 2));
    if (!plan.eligibleForImport) process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
