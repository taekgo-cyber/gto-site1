import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { importBlogDurabilityBundleV1 } from "../../src/lib/blog/durability/import";

type Environment = "local" | "test" | "disposable";

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(argv: string[]) {
  const bundlePath = valueAfter(argv, "--bundle");
  const actorUserId = valueAfter(argv, "--actor-user-id");
  const targetBaseUrl = valueAfter(argv, "--target-base-url");
  const environment = valueAfter(argv, "--environment") as Environment | undefined;
  if (!bundlePath || !actorUserId || !targetBaseUrl || !environment) {
    throw new Error("BLOG_DURABILITY_IMPORT_ARGS_REQUIRED");
  }
  if (!(["local", "test", "disposable"] as const).includes(environment)) {
    throw new Error("BLOG_DURABILITY_GATE6_ENVIRONMENT_INVALID");
  }
  return { bundlePath: path.resolve(bundlePath), actorUserId, targetBaseUrl, environment };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(args.bundlePath, "utf8");
  const bundle = JSON.parse(raw) as unknown;
  const report = await importBlogDurabilityBundleV1({
    bundle: bundle as never,
    actorUserId: args.actorUserId,
    targetBaseUrl: args.targetBaseUrl,
    environment: args.environment,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "BLOG_DURABILITY_IMPORT_FAILED";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
