import "dotenv/config";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertLocalSourceDatabaseBoundary } from "./boundary";
import {
  serializeCbtSourceBundleV1,
  validateCbtSourceBundleV1,
  verifyExact80Manifest,
} from "./bundle-v1";
import { assertKnownPairs, valueAfter } from "./cli-shared";
import { exportCbtSourceBundleV1 } from "./export";
import { createPrismaSourceGraphRepository } from "./prisma-repository";
import { CBT_EXACT_80_MANIFEST_CHECKSUM } from "./types";

const DEFAULT_MANIFEST = "data/cbt/evidence/launch-closeout-80/exact-80-launch-manifest.json";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  assertKnownPairs(
    argv,
    new Set(["--manifest", "--output", "--branch", "--head", "--exported-at"]),
  );
  const output = valueAfter(argv, "--output");
  const branch = valueAfter(argv, "--branch");
  const head = valueAfter(argv, "--head");
  if (!output || !branch || !head) throw new Error("cbt_source_export_arguments_required");
  const exportedAtRaw = valueAfter(argv, "--exported-at");
  const exportedAt = exportedAtRaw ? new Date(exportedAtRaw) : new Date();
  if (Number.isNaN(exportedAt.getTime())) throw new Error("cbt_source_exported_at_invalid");
  assertLocalSourceDatabaseBoundary();

  const manifestPath = path.resolve(valueAfter(argv, "--manifest") ?? DEFAULT_MANIFEST);
  const manifest = verifyExact80Manifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    CBT_EXACT_80_MANIFEST_CHECKSUM,
  );
  const outputPath = path.resolve(output);
  if (!(await stat(path.dirname(outputPath))).isDirectory()) {
    throw new Error("cbt_source_output_parent_invalid");
  }

  const repository = createPrismaSourceGraphRepository();
  try {
    const report = await exportCbtSourceBundleV1({ repository, manifest, exportedAt, branch, head });
    const validation = validateCbtSourceBundleV1(report.bundle);
    if (!validation.bundle) throw new Error(`cbt_source_bundle_invalid:${validation.errors.join(",")}`);
    await writeFile(outputPath, serializeCbtSourceBundleV1(report.bundle), { encoding: "utf8", flag: "wx" });
    console.log(
      JSON.stringify(
        {
          output: outputPath,
          manifestChecksum: manifest.checksum,
          selectedMasterCount: report.selectedMasterCount,
          dependencyCounts: report.dependencyCounts,
          missingDependencies: report.missingDependencies,
          duplicateIdentities: report.duplicateIdentities,
          knownBadIncluded: report.knownBadIncluded,
          bundleChecksum: report.bundleChecksum,
          sourceDatabaseIdentityFingerprint: report.bundle.source.databaseIdentityFingerprint,
          sourceReadBackUnchanged: report.sourceReadBackUnchanged,
          dataMinimization: validation.errors.length === 0 ? "PASS" : "FAIL",
          dbWrite: report.dbWrite,
        },
        null,
        2,
      ),
    );
  } finally {
    await repository.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
