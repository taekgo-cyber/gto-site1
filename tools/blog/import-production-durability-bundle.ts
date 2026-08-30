import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { importBlogDurabilityBundleProductionV1 } from "../../src/lib/blog/durability/production-import";
import { RELEASE_MUTATION_ACK } from "../../src/lib/release/production-boundary";

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(argv: string[]) {
  const environment = valueAfter(argv, "--environment");
  const bundlePath = valueAfter(argv, "--bundle");
  const actorUserId = valueAfter(argv, "--actor-user-id");
  const targetBaseUrl = valueAfter(argv, "--target-base-url");
  const expectedCanonicalOrigin = valueAfter(argv, "--expected-canonical-origin");
  const expectedDatabaseHost = valueAfter(argv, "--expected-db-host");
  const expectedDatabaseName = valueAfter(argv, "--expected-db-name");
  const expectedPlanChecksum = valueAfter(argv, "--expected-plan-checksum");
  const backupEvidenceId = valueAfter(argv, "--backup-evidence-id");
  const restoreEvidenceId = valueAfter(argv, "--restore-evidence-id");
  const approvalId = valueAfter(argv, "--approval-id");
  const acknowledgement = valueAfter(argv, "--ack");
  if (
    (environment !== "disposable" && environment !== "production") ||
    !bundlePath ||
    !actorUserId ||
    !targetBaseUrl ||
    !expectedCanonicalOrigin ||
    !expectedDatabaseHost ||
    !expectedDatabaseName ||
    !expectedPlanChecksum ||
    !backupEvidenceId ||
    !restoreEvidenceId ||
    !approvalId ||
    !acknowledgement
  ) {
    throw new Error("BLOG_DURABILITY_PRODUCTION_IMPORT_ARGS_REQUIRED");
  }
  return {
    environment,
    bundlePath: path.resolve(bundlePath),
    actorUserId,
    targetBaseUrl,
    expectedCanonicalOrigin,
    expectedDatabaseHost,
    expectedDatabaseName,
    expectedPlanChecksum,
    backupEvidenceId,
    restoreEvidenceId,
    approvalId,
    acknowledgement,
  } as const;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = JSON.parse(await fs.readFile(args.bundlePath, "utf8")) as never;
  const report = await importBlogDurabilityBundleProductionV1({ ...args, bundle });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "BLOG_DURABILITY_PRODUCTION_IMPORT_FAILED";
  process.stderr.write(`${message}\n`);
  if (message === "RELEASE_MUTATION_ACK_REQUIRED") {
    process.stderr.write(`Expected acknowledgement: ${RELEASE_MUTATION_ACK}\n`);
  }
  process.exitCode = 1;
});
