// Gate 2 Operational Closeout CLI — read-only diagnostic + deterministic artifact emission.
// Usage:
//   npm run cbt:gate2-closeout
//   npm run cbt:gate2-closeout -- --out-dir data/cbt/evidence/gate2-closeout
//
// No provider calls, no production DB writes. Reads DB, computes the bounded operational closeout,
// and optionally writes closeout-baseline.json / closeout-current.json / closeout-manifest.json.
import "dotenv/config";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runDatasetAudit, hasErrors } from "./batch/audit";
import { evaluateGate2OperationalCloseout } from "./batch/gate2-closeout-evaluator";
import {
  buildCloseoutBaseline,
  buildCloseoutCurrent,
  buildCloseoutManifest,
  computeCloseoutBaselineIdentity,
  scopeRowsByCandidateSet,
  writeCloseoutArtifacts,
} from "./batch/gate2-closeout-evidence";
import { FROZEN_GATE_TARGET_COUNT, FROZEN_GATE_TARGET_HASH, FROZEN_GATE_TARGET_IDS } from "./batch/gate2-frozen-gate";
import { hashTargetIds, selectLatestGeneratedQuestions, type Gate2GeneratedQuestion } from "./batch/gate2-state";
import {
  canonicalJsonString,
  computeSnapshotIdentity,
  DEFAULT_EVIDENCE_BASE_DIR,
  EVIDENCE_VERSION,
  hashCanonical,
  snapshotRowsCanonical,
} from "./batch/gate2-integrity-evidence";

const HISTORICAL_PRE_EVIDENCE_ID = "218cf09f-50e0-4d21-9ac9-ac90968e155f";

type VerifiedPre = {
  generatedQuestions: unknown[];
  generatedQuestionQAs: unknown[];
  baselineEntries: readonly { candidateQuestionId: string; latestGeneratedQuestionId: string | null; latestStatus: string | null; latestErrorCode: string | null }[];
};

async function loadVerifiedHistoricalPre(): Promise<VerifiedPre> {
  const evidenceDir = path.join(DEFAULT_EVIDENCE_BASE_DIR, HISTORICAL_PRE_EVIDENCE_ID);
  const preRaw = await readFile(path.join(evidenceDir, "pre.json"), "utf8");
  const pre = JSON.parse(preRaw) as {
    version: string;
    evidenceId: string;
    gateTargetHash: string;
    gateTargetCount: number;
    targetIds: readonly string[];
    baselineIdentity: string;
    preSnapshotIdentity: string;
    preSnapshotGeneratedQuestionsHash: string;
    preSnapshotGeneratedQuestionQAsHash: string;
  };
  if (pre.version !== EVIDENCE_VERSION || pre.evidenceId !== HISTORICAL_PRE_EVIDENCE_ID) {
    throw new Error("historical PRE evidence version/evidenceId mismatch");
  }
  if (
    pre.gateTargetCount !== FROZEN_GATE_TARGET_COUNT ||
    pre.gateTargetHash !== FROZEN_GATE_TARGET_HASH ||
    pre.targetIds.length !== FROZEN_GATE_TARGET_COUNT ||
    hashTargetIds(pre.targetIds) !== FROZEN_GATE_TARGET_HASH
  ) {
    throw new Error("historical PRE frozen target identity mismatch");
  }
  const sortedPre = [...pre.targetIds].sort();
  const sortedFrozen = [...FROZEN_GATE_TARGET_IDS].sort();
  if (!sortedPre.every((id, index) => id === sortedFrozen[index])) {
    throw new Error("historical PRE target set mismatch");
  }

  const [gqRaw, qaRaw, baselineRaw] = await Promise.all([
    readFile(path.join(evidenceDir, "generatedQuestions.json"), "utf8"),
    readFile(path.join(evidenceDir, "generatedQuestionQAs.json"), "utf8"),
    readFile(path.join(evidenceDir, "baseline.json"), "utf8"),
  ]);
  const generatedQuestions = JSON.parse(gqRaw) as unknown[];
  const generatedQuestionQAs = JSON.parse(qaRaw) as unknown[];
  const baselineEntries = JSON.parse(baselineRaw) as VerifiedPre["baselineEntries"];
  const gqHash = snapshotRowsCanonical(generatedQuestions).hash;
  const qaHash = snapshotRowsCanonical(generatedQuestionQAs).hash;
  if (gqHash !== pre.preSnapshotGeneratedQuestionsHash || qaHash !== pre.preSnapshotGeneratedQuestionQAsHash) {
    throw new Error("historical PRE snapshot hash mismatch");
  }
  if (computeSnapshotIdentity(gqHash, qaHash) !== pre.preSnapshotIdentity) {
    throw new Error("historical PRE snapshot identity mismatch");
  }
  if (hashCanonical(baselineEntries) !== pre.baselineIdentity) {
    throw new Error("historical PRE baseline identity mismatch");
  }
  // Keep the canonical bytes check explicit so a semantically equivalent but tampered file is rejected.
  if (canonicalJsonString(generatedQuestions) + "\n" !== gqRaw || canonicalJsonString(generatedQuestionQAs) + "\n" !== qaRaw || canonicalJsonString(baselineEntries) + "\n" !== baselineRaw) {
    throw new Error("historical PRE artifact canonical bytes mismatch");
  }
  return { generatedQuestions, generatedQuestionQAs, baselineEntries };
}

function toGate2GeneratedQuestions(rows: readonly unknown[]): Gate2GeneratedQuestion[] {
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    candidateQuestionId: String(row.candidateQuestionId),
    status: row.status as Gate2GeneratedQuestion["status"],
    errorCode: row.errorCode == null ? null : String(row.errorCode),
    createdAt: new Date(String(row.createdAt)),
  }));
}

function getOpt(argv: string[], key: string): string | undefined {
  const idx = argv.findIndex(
    (a) => a === `--${key}` || a.startsWith(`--${key}=`),
  );
  if (idx === -1) return undefined;
  const arg = argv[idx];
  if (arg.includes("=")) return arg.split("=").slice(1).join("=");
  const next = argv[idx + 1];
  if (next && !next.startsWith("--")) return next;
  return "";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outDir = getOpt(argv, "out-dir");

  const mod = await import("@/lib/prisma");
  const prisma = mod.prisma;

  const targetIds = [...FROZEN_GATE_TARGET_IDS];
  const historicalPre = await loadVerifiedHistoricalPre();

  // Current live DB is read-only current state only. Historical PRE is the immutable baseline.
  const gqRows = await prisma.generatedQuestion.findMany({
    where: { candidateQuestionId: { in: targetIds } },
  });
  const gqIds = gqRows.map((r) => (r as { id: string }).id);
  const qaRows = await prisma.generatedQuestionQA.findMany({
    where: { generatedQuestionId: { in: gqIds } },
  });

  const latestByCandidate = selectLatestGeneratedQuestions(toGate2GeneratedQuestions(gqRows));

  const baselineScopedRows = scopeRowsByCandidateSet(
    historicalPre.generatedQuestions,
    historicalPre.generatedQuestionQAs,
    targetIds,
  );
  const currentScopedRows = scopeRowsByCandidateSet(gqRows, qaRows, targetIds);
  const preLatestByCandidate = selectLatestGeneratedQuestions(
    toGate2GeneratedQuestions(historicalPre.generatedQuestions),
  );

  const baseline = buildCloseoutBaseline(targetIds, preLatestByCandidate, baselineScopedRows);
  const current = buildCloseoutCurrent(targetIds, currentScopedRows);

  const audit = await runDatasetAudit();
  const auditErrors = audit.findings.filter((f) => f.level === "error").length;
  const auditWarnings = audit.findings.filter(
    (f) => f.level === "warning",
  ).length;

  const result = evaluateGate2OperationalCloseout({
    targetIds,
    latestByCandidate,
    baselineScopedRows,
    currentScopedRows,
    relevantRuns: [],
    datasetAuditPassed: !hasErrors(audit),
    auditErrors,
    auditWarnings,
  });

  const manifest = buildCloseoutManifest({
    decision: result.decision,
    targetCount: targetIds.length,
    baselineIdentity: baseline.baselineIdentity,
    currentScopedIdentity: current.scopedIdentity,
    appendOnlyPassed: result.appendOnlyPassed,
    scopedDeletedCount: 0,
    scopedMutatedCount: 0,
    scopedAppendedCount: 0,
    auditErrors,
    auditWarnings,
    circuitOpenCount: result.circuitOpenCount,
    promoteEligibility: result.promoteEligibility,
    reasons: result.reasons,
  });

  if (outDir) {
    const resolvedOutDir = path.resolve(outDir);
    await mkdir(resolvedOutDir, { recursive: true });
    await writeCloseoutArtifacts(resolvedOutDir, baseline, current, manifest);
  }

  console.log(JSON.stringify({ result, manifest }, null, 2));
  process.exitCode = result.decision === "GATE2_OPERATIONAL_CLOSEOUT_PASS" ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
