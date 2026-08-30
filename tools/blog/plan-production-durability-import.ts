import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { planBlogDurabilityProductionImportV1 } from "../../src/lib/blog/durability/production-import";

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
  if (
    (environment !== "disposable" && environment !== "production") ||
    !bundlePath ||
    !actorUserId ||
    !targetBaseUrl ||
    !expectedCanonicalOrigin ||
    !expectedDatabaseHost ||
    !expectedDatabaseName
  ) {
    throw new Error("BLOG_DURABILITY_PRODUCTION_PLAN_ARGS_REQUIRED");
  }
  return {
    environment,
    bundlePath: path.resolve(bundlePath),
    actorUserId,
    targetBaseUrl,
    expectedCanonicalOrigin,
    expectedDatabaseHost,
    expectedDatabaseName,
  } as const;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = JSON.parse(await fs.readFile(args.bundlePath, "utf8")) as never;
  const plan = await planBlogDurabilityProductionImportV1({
    ...args,
    bundle,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "BLOG_DURABILITY_PRODUCTION_PLAN_FAILED"}\n`);
  process.exitCode = 1;
});
