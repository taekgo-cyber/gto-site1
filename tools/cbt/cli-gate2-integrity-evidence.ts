// Gate 2 Integrity Evidence CLI — PRE, FINALIZE, and VERIFY-PRE immutable evidence binding
// Usage:
//   tsx tools/cbt/cli-gate2-integrity-evidence.ts pre [--evidence-id <id>] [--target-ids-file <path>] [--evidence-base <dir>] [--run-log-dir <dir>] [--lane <contract|provider>]
//   tsx tools/cbt/cli-gate2-integrity-evidence.ts finalize --evidence-id <id> --run-id <runId> [--evidence-base <dir>] [--run-log-dir <dir>]
//   tsx tools/cbt/cli-gate2-integrity-evidence.ts verify-pre --evidence-id <id> [--evidence-base <dir>]
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPreEvidence, finalizeEvidence, verifyPreEvidenceAgainstCurrentDb, DEFAULT_EVIDENCE_BASE_DIR, DEFAULT_RUNLOG_DIR } from "./batch/gate2-integrity-evidence";
import { FROZEN_GATE_TARGET_HASH } from "./batch/gate2-frozen-gate";
import { getGate2RecoveryPolicy } from "./batch/gate2-recovery-policy";

// helper to get option value with following token
function getOpt(argv: string[], key: string): string | undefined {
  const idx = argv.findIndex((a) => a === `--${key}` || a.startsWith(`--${key}=`));
  if (idx === -1) return undefined;
  const arg = argv[idx];
  if (arg.includes("=")) return arg.split("=").slice(1).join("=");
  const next = argv[idx + 1];
  if (next && !next.startsWith("--")) return next;
  return "";
}

async function readTargetIds(filePath: string): Promise<string[]> {
  const raw = await readFile(filePath, "utf8");
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd !== "pre" && cmd !== "finalize" && cmd !== "verify-pre") {
    throw new Error("사용법: cli-gate2-integrity-evidence.ts pre|finalize|verify-pre [options]");
  }

  const evidenceId = getOpt(argv, "evidence-id") || undefined;
  const evidenceBaseDir = getOpt(argv, "evidence-base") || DEFAULT_EVIDENCE_BASE_DIR;
  const runLogDir = getOpt(argv, "run-log-dir") || DEFAULT_RUNLOG_DIR;
  const targetIdsFile = getOpt(argv, "target-ids-file") || "docs/cbt/gate2-targets.txt";
  const laneOpt = getOpt(argv, "lane") as "contract" | "provider" | undefined;
  const runId = getOpt(argv, "run-id") || getOpt(argv, "runId") || undefined;

  if (cmd === "pre") {
    if (laneOpt && laneOpt !== "contract" && laneOpt !== "provider") throw new Error("lane must be contract|provider");
    const targetIds = await readTargetIds(targetIdsFile);
    // Independent frozen Gate target lock — do not derive expected from same input file
    const gateTargetHash = FROZEN_GATE_TARGET_HASH;
    // DB read-only via prisma
    const mod = await import("@/lib/prisma");
    const db = {
      generatedQuestion: { findMany: (args?: unknown) => (mod.prisma.generatedQuestion.findMany as unknown as (a?: unknown)=>Promise<unknown[]>)(args) },
      generatedQuestionQA: { findMany: (args?: unknown) => (mod.prisma.generatedQuestionQA.findMany as unknown as (a?: unknown)=>Promise<unknown[]>)(args) },
    };
    let lane: string | null = null;
    let policyVersion: string | null = null;
    let parentRunId: string | null = null;
    let targetSetHash: string | null = null;
    if (laneOpt) {
      const policy = getGate2RecoveryPolicy(laneOpt);
      lane = policy.lane;
      policyVersion = policy.policyVersion;
      parentRunId = policy.parentRunId;
      targetSetHash = policy.targetSetHash;
      // validate that lane's target ids hash matches policy — but we are using gate target ids for baseline? Keep gate hash separate.
    }
    const result = await createPreEvidence({
      evidenceId,
      targetIds,
      expectedGateTargetHash: gateTargetHash,
      evidenceBaseDir,
      db,
      lane,
      policyVersion,
      parentRunId,
      targetSetHash,
    });
    console.log(JSON.stringify({ evidenceId: result.evidenceId, preManifest: result.preManifest, evidenceDir: result.evidenceDir }, null, 2));
    return;
  }

  if (cmd === "finalize") {
    if (!evidenceId) throw new Error("finalize requires --evidence-id <id>");
    if (!runId) throw new Error("finalize requires --run-id <runId>");
    // prevent retroactive certification of aborted run without pre artifact? Our finalize will enforce aborted check.
    const mod = await import("@/lib/prisma");
    const db = {
      generatedQuestion: { findMany: (args?: unknown) => (mod.prisma.generatedQuestion.findMany as unknown as (a?: unknown)=>Promise<unknown[]>)(args) },
      generatedQuestionQA: { findMany: (args?: unknown) => (mod.prisma.generatedQuestionQA.findMany as unknown as (a?: unknown)=>Promise<unknown[]>)(args) },
    };
    const result = await finalizeEvidence({ evidenceId: evidenceId!, runId: runId!, evidenceBaseDir, runLogDir, db });
    console.log(JSON.stringify({ evidenceId, runId, postManifest: result.postManifest, bindingManifest: result.bindingManifest, finalManifest: result.finalManifest }, null, 2));
    // exit code reflects appendOnlyPassed? Still 0 for finalize success even if appendOnly failed, because evidence produced but evaluator will FAIL.
    if (!result.postManifest.appendOnlyPassed) {
      console.error(`appendOnlyFailed: deleted=${result.postManifest.deletedCount} mutated=${result.postManifest.mutatedCount}`);
    }
    return;
  }

  if (cmd === "verify-pre") {
    if (!evidenceId) throw new Error("verify-pre requires --evidence-id <id>");
    const evidenceDir = path.join(evidenceBaseDir, evidenceId);
    const mod = await import("@/lib/prisma");
    const db = {
      generatedQuestion: { findMany: (args?: unknown) => (mod.prisma.generatedQuestion.findMany as unknown as (a?: unknown)=>Promise<unknown[]>)(args) },
      generatedQuestionQA: { findMany: (args?: unknown) => (mod.prisma.generatedQuestionQA.findMany as unknown as (a?: unknown)=>Promise<unknown[]>)(args) },
    };
    const result = await verifyPreEvidenceAgainstCurrentDb(evidenceDir, db);
    console.log(JSON.stringify({
      evidenceId,
      evidenceDir,
      valid: result.valid,
      differences: result.differences,
      reason: result.reason,
    }, null, 2));
    if (!result.valid) {
      process.exitCode = 1;
    }
    return;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
