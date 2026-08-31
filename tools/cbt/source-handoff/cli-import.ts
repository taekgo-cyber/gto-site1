import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertStagingTargetBoundary } from "./boundary";
import { assertKnownPairs, expectedMigrationNames, valueAfter } from "./cli-shared";
import { executeCbtSourceImportV1 } from "./import";
import { createPrismaSourceImportDatabase } from "./prisma-repository";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  assertKnownPairs(argv, new Set(["--bundle", "--expected-plan", "--approval"]));
  const bundlePathRaw = valueAfter(argv, "--bundle");
  const expectedPlanChecksum = valueAfter(argv, "--expected-plan");
  const approval = valueAfter(argv, "--approval");
  if (!bundlePathRaw || !expectedPlanChecksum || !approval) {
    throw new Error("cbt_source_import_arguments_required");
  }
  const boundary = assertStagingTargetBoundary();
  const bundle = JSON.parse(await readFile(path.resolve(bundlePathRaw), "utf8")) as unknown;
  const database = createPrismaSourceImportDatabase();
  try {
    const result = await executeCbtSourceImportV1({
      database,
      bundle,
      target: { project: boundary.project, environment: boundary.environment, service: boundary.service },
      expectedMigrationNames: await expectedMigrationNames(),
      expectedPlanChecksum,
      approval,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await database.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
