import "dotenv/config";
import path from "node:path";
import { getDefaultBatchContentDb } from "./batch/content-query";
import { buildGate3ReviewArtifacts, verifyGate3ReviewArtifacts, type Gate3Db } from "./batch/gate3-human-review-evidence";

async function main(): Promise<void> {
  const db = (await getDefaultBatchContentDb()) as unknown as Gate3Db;
  const outDir = process.argv.find((arg) => arg.startsWith("--out-dir="))?.slice("--out-dir=".length);
  const result = await buildGate3ReviewArtifacts({ db, outputBaseDir: outDir ?? undefined });
  const verification = await verifyGate3ReviewArtifacts(result.outputDir);
  if (!verification.valid) throw new Error(`Gate3 artifact verification failed: ${verification.reason}`);
  console.log(JSON.stringify({ decision: "GATE3_PHASE3A_FREEZE_EXPORT_PASS", reviewId: result.reviewId, outputDir: path.resolve(result.outputDir), entryCount: result.review.entries.length, gate3TargetSetHash: result.review.gate3TargetSetHash, gate3ReviewSnapshotHash: result.review.gate3ReviewSnapshotHash, dbWrite: false, artifactValid: verification.valid }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
