import { readFile } from "node:fs/promises";
import path from "node:path";
import { dryRunBlogDurabilityImportV1 } from "@/lib/blog/durability/dry-run";
import { prisma } from "@/lib/prisma";

type CliArgs = {
  bundlePath: string;
  actorUserId: string;
  targetBaseUrl: string;
};

function valueAfter(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return undefined;
  return argv[index + 1];
}

export function parseBlogDurabilityDryRunArgs(argv: string[]): CliArgs {
  const bundlePath = valueAfter(argv, "--bundle");
  const actorUserId = valueAfter(argv, "--actor-user-id");
  const targetBaseUrl = valueAfter(argv, "--target-base-url");
  if (!bundlePath || !actorUserId || !targetBaseUrl) throw new Error("BLOG_DURABILITY_DRY_RUN_ARGS_REQUIRED");

  const known = new Set(["--bundle", "--actor-user-id", "--target-base-url"]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!known.has(argv[index]) || index + 1 >= argv.length) throw new Error("BLOG_DURABILITY_DRY_RUN_ARG_INVALID");
  }
  return { bundlePath: path.resolve(bundlePath), actorUserId, targetBaseUrl };
}

export async function runBlogDurabilityDryRun(argv: string[]): Promise<void> {
  const args = parseBlogDurabilityDryRunArgs(argv);
  let bundle: unknown;
  try {
    bundle = JSON.parse(await readFile(args.bundlePath, "utf8")) as unknown;
  } catch {
    throw new Error("BLOG_DURABILITY_BUNDLE_READ_INVALID");
  }

  const report = await dryRunBlogDurabilityImportV1({
    bundle,
    actorUserId: args.actorUserId,
    targetBaseUrl: args.targetBaseUrl,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.eligibleForWrite) process.exitCode = 1;
}

runBlogDurabilityDryRun(process.argv.slice(2))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "BLOG_DURABILITY_DRY_RUN_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
