import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertKnownPairs, valueAfter } from "./cli-shared";
import { verifyOperatorArtifact } from "./operator-artifact";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  assertKnownPairs(argv, new Set(["--bundle"]));
  const bundlePathRaw = valueAfter(argv, "--bundle");
  if (!bundlePathRaw) throw new Error("cbt_operator_artifact_bundle_required");

  const bundlePath = path.resolve(bundlePathRaw);
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as unknown;
  const summary = verifyOperatorArtifact(bundle);
  console.log(JSON.stringify({ bundle: bundlePath, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
