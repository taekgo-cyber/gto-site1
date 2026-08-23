import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  laneEntries,
  loadAndVerifyResidualR1,
  RESIDUAL_R1_HASHES,
  RESIDUAL_R1_DIR,
  type ResidualFreezeBinding,
} from "./residual-13-evidence";
import { FROZEN_GATE_TARGET_IDS } from "./gate2-frozen-gate";

export const LANE_A_TARGET_COUNT = 9 as const;
export const LANE_A_TARGET_SET_HASH =
  "A7DAC798A71CBDB65A25E9CA7CE9D54B8DBB88E073AEE71EE6188A67FDB8F357";
export const UNCERTAIN_CONFIRMATION_TOKEN = "QUARANTINE_LANE_A_EXECUTION_UNCERTAIN";
export const UNCERTAIN_EVIDENCE_VERSION = "cbt-r10b-lane-a-execution-uncertain-v1";
export const UNCERTAIN_EVIDENCE_ROOT = path.join(
  "data",
  "cbt",
  "evidence",
  "residual-13",
);

const EVIDENCE_DIR_PREFIX = "lane-a-execution-uncertain";
const EVIDENCE_JSON_NAME = "lane-a-execution-uncertain.json";
const EVIDENCE_SHA_NAME = "lane-a-execution-uncertain.sha256";

export type ReadOnlyFindMany = (args?: unknown) => Promise<readonly unknown[]>;

export type UncertainEvidenceDb = {
  candidateQuestion: { findMany: ReadOnlyFindMany };
  generatedQuestion: { findMany: ReadOnlyFindMany };
  generatedQuestionQA: { findMany: ReadOnlyFindMany };
};

type CandidateRow = { id: string };
type GeneratedQuestionRow = { id: string; candidateQuestionId: string };
type GeneratedQuestionQARow = { id: string; generatedQuestionId: string };

export type LaneAForensicSummary = {
  exact9TotalGQ: number;
  baselineGQCount: number;
  newGQCount: number;
  newQACount: number;
  candidatesWithNewGQ: readonly string[];
  candidatesWithNewGQButNoQA: readonly string[];
  candidateContamination: number;
  gate50Contamination: number;
};

export type LaneAUncertainEvidence = {
  version: typeof UNCERTAIN_EVIDENCE_VERSION;
  decision: "LANE_A_EXECUTION_UNCERTAIN_QUARANTINE";
  lane: "TRANSIENT";
  targetCount: typeof LANE_A_TARGET_COUNT;
  targetSetHash: typeof LANE_A_TARGET_SET_HASH;
  candidateIds: readonly string[];
  r1: {
    candidateSetHash: typeof RESIDUAL_R1_HASHES.candidateSet;
    frozenSha256: typeof RESIDUAL_R1_HASHES.frozen;
    manifestSha256: typeof RESIDUAL_R1_HASHES.manifest;
    exclusionAttestationSha256: typeof RESIDUAL_R1_HASHES.attestation;
  };
  outcome: "QUARANTINED_EXECUTION_UNCERTAIN";
  attempted: "UNKNOWN";
  logicalAttemptCount: "UNKNOWN";
  providerCall: "UNKNOWN";
  dbWrite: 0;
  rerunAllowed: false;
  humanReviewEligible: false;
  promoteEligible: false;
  appendOnly: true;
  createdAt: string;
  forensic: LaneAForensicSummary;
};

export type EvidenceWriteResult = {
  directory: string;
  jsonPath: string;
  sha256Path: string;
  rawSha256: string;
  evidence: LaneAUncertainEvidence;
};

function sha256Upper(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();
}

// The R3 Lane A target hash is an already-approved historical binding. Its
// canonical payload uses the literal two-character separator "\\n"; keep the
// binding local so the existing Gate2 hash helper is not changed.
function laneATargetHash(ids: readonly string[]): string {
  return sha256Upper(`${ids.join("\\n")}\\n`);
}

function asString(row: unknown, field: string): string {
  const value = (row as Record<string, unknown>)[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`read-only forensic row missing ${field}`);
  }
  return value;
}

function uniqueInTargetOrder(values: readonly string[], targets: readonly string[]): string[] {
  const valueSet = new Set(values);
  return targets.filter((target) => valueSet.has(target));
}

export function assertR1Binding(binding: ResidualFreezeBinding): void {
  if (binding.frozenHash !== RESIDUAL_R1_HASHES.frozen) throw new Error("R1 frozen hash mismatch");
  if (binding.manifestHash !== RESIDUAL_R1_HASHES.manifest) throw new Error("R1 manifest hash mismatch");
  if (binding.exclusionAttestationHash !== RESIDUAL_R1_HASHES.attestation) throw new Error("R1 attestation hash mismatch");
  if (binding.candidateSetHash !== RESIDUAL_R1_HASHES.candidateSet) throw new Error("R1 candidate hash mismatch");
}

export function assertLaneATarget(binding: ResidualFreezeBinding): readonly string[] {
  assertR1Binding(binding);
  const entries = laneEntries(binding, "TRANSIENT");
  const targets = entries.map((entry) => entry.candidateId);
  if (targets.length !== LANE_A_TARGET_COUNT) throw new Error("Lane A target count mismatch");
  if (new Set(targets).size !== LANE_A_TARGET_COUNT) throw new Error("Lane A target identity contains duplicates");
  if (laneATargetHash(targets) !== LANE_A_TARGET_SET_HASH) throw new Error("Lane A target hash mismatch");
  const gate50 = new Set(FROZEN_GATE_TARGET_IDS);
  if (targets.some((target) => gate50.has(target))) throw new Error("Lane A Gate50 contamination detected");
  return targets;
}

export async function collectLaneAForensic(
  db: UncertainEvidenceDb,
  binding: ResidualFreezeBinding,
): Promise<LaneAForensicSummary> {
  const targets = assertLaneATarget(binding);
  const targetSet = new Set(targets);
  const baselineGqIds = new Set(laneEntries(binding, "TRANSIENT").map((entry) => entry.latestGeneratedQuestionId));
  const baselineQaIds = new Set(
    laneEntries(binding, "TRANSIENT")
      .map((entry) => entry.latestQaId)
      .filter((id): id is string => typeof id === "string"),
  );

  const candidateRows = (await db.candidateQuestion.findMany({
    where: { id: { in: targets } },
    select: { id: true },
  })).map((row) => ({ id: asString(row, "id") })) as CandidateRow[];
  const generatedRows = (await db.generatedQuestion.findMany({
    where: { candidateQuestionId: { in: targets } },
    select: { id: true, candidateQuestionId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })).map((row) => ({
    id: asString(row, "id"),
    candidateQuestionId: asString(row, "candidateQuestionId"),
  })) as GeneratedQuestionRow[];
  const generatedIds = generatedRows.map((row) => row.id);
  const qaRows = generatedIds.length === 0
    ? []
    : (await db.generatedQuestionQA.findMany({
        where: { generatedQuestionId: { in: generatedIds } },
        select: { id: true, generatedQuestionId: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })).map((row) => ({
        id: asString(row, "id"),
        generatedQuestionId: asString(row, "generatedQuestionId"),
      })) as GeneratedQuestionQARow[];

  const actualCandidateIds = candidateRows.map((row) => row.id);
  const unexpectedGqCandidateIds = generatedRows
    .map((row) => row.candidateQuestionId)
    .filter((candidateId) => !targetSet.has(candidateId));
  const missingCandidateIds = targets.filter((target) => !actualCandidateIds.includes(target));
  const newGeneratedRows = generatedRows.filter((row) => !baselineGqIds.has(row.id));
  const newQaRows = qaRows.filter((row) => !baselineQaIds.has(row.id));
  const qaGeneratedIds = new Set(qaRows.map((row) => row.generatedQuestionId));
  const candidatesWithNewGq = uniqueInTargetOrder(
    newGeneratedRows.map((row) => row.candidateQuestionId),
    targets,
  );
  const candidatesWithNewGqButNoQa = uniqueInTargetOrder(
    newGeneratedRows
      .filter((row) => !qaGeneratedIds.has(row.id))
      .map((row) => row.candidateQuestionId),
    targets,
  );

  return {
    exact9TotalGQ: generatedRows.length,
    baselineGQCount: generatedRows.filter((row) => baselineGqIds.has(row.id)).length,
    newGQCount: newGeneratedRows.length,
    newQACount: newQaRows.length,
    candidatesWithNewGQ: candidatesWithNewGq,
    candidatesWithNewGQButNoQA: candidatesWithNewGqButNoQa,
    candidateContamination: new Set([
      ...unexpectedGqCandidateIds,
      ...actualCandidateIds.filter((candidateId) => !targetSet.has(candidateId)),
      ...missingCandidateIds,
    ]).size,
    gate50Contamination: targets.filter((target) => new Set(FROZEN_GATE_TARGET_IDS).has(target)).length,
  };
}

export function forensicReasons(summary: LaneAForensicSummary): string[] {
  const reasons: string[] = [];
  if (summary.exact9TotalGQ !== LANE_A_TARGET_COUNT) reasons.push(`exact9TotalGQ expected 9 got ${summary.exact9TotalGQ}`);
  if (summary.baselineGQCount !== LANE_A_TARGET_COUNT) reasons.push(`baselineGQCount expected 9 got ${summary.baselineGQCount}`);
  if (summary.newGQCount !== 0) reasons.push(`newGQCount expected 0 got ${summary.newGQCount}`);
  if (summary.newQACount !== 0) reasons.push(`newQACount expected 0 got ${summary.newQACount}`);
  if (summary.candidatesWithNewGQ.length !== 0) reasons.push("candidatesWithNewGQ is not empty");
  if (summary.candidatesWithNewGQButNoQA.length !== 0) reasons.push("candidatesWithNewGQButNoQA is not empty");
  if (summary.candidateContamination !== 0) reasons.push(`candidate contamination expected 0 got ${summary.candidateContamination}`);
  if (summary.gate50Contamination !== 0) reasons.push(`Gate50 contamination expected 0 got ${summary.gate50Contamination}`);
  return reasons;
}

export function assertForensicPass(summary: LaneAForensicSummary): void {
  const reasons = forensicReasons(summary);
  if (reasons.length > 0) throw new Error(`Lane A R9B forensic failed: ${reasons.join("; ")}`);
}

function expectedEvidenceShape(
  binding: ResidualFreezeBinding,
  summary: LaneAForensicSummary,
  createdAt: string,
): LaneAUncertainEvidence {
  const candidateIds = assertLaneATarget(binding);
  assertForensicPass(summary);
  return {
    version: UNCERTAIN_EVIDENCE_VERSION,
    decision: "LANE_A_EXECUTION_UNCERTAIN_QUARANTINE",
    lane: "TRANSIENT",
    targetCount: LANE_A_TARGET_COUNT,
    targetSetHash: LANE_A_TARGET_SET_HASH,
    candidateIds,
    r1: {
      candidateSetHash: RESIDUAL_R1_HASHES.candidateSet,
      frozenSha256: RESIDUAL_R1_HASHES.frozen,
      manifestSha256: RESIDUAL_R1_HASHES.manifest,
      exclusionAttestationSha256: RESIDUAL_R1_HASHES.attestation,
    },
    outcome: "QUARANTINED_EXECUTION_UNCERTAIN",
    attempted: "UNKNOWN",
    logicalAttemptCount: "UNKNOWN",
    providerCall: "UNKNOWN",
    dbWrite: 0,
    rerunAllowed: false,
    humanReviewEligible: false,
    promoteEligible: false,
    appendOnly: true,
    createdAt,
    forensic: summary,
  };
}

export function buildUncertainEvidence(
  binding: ResidualFreezeBinding,
  summary: LaneAForensicSummary,
  createdAt = new Date().toISOString(),
): LaneAUncertainEvidence {
  return expectedEvidenceShape(binding, summary, createdAt);
}

function evidenceDirectory(baseDir = UNCERTAIN_EVIDENCE_ROOT): string {
  return path.join(baseDir, `${EVIDENCE_DIR_PREFIX}-${LANE_A_TARGET_SET_HASH.slice(0, 12).toLowerCase()}`);
}

export function evidencePaths(baseDir = UNCERTAIN_EVIDENCE_ROOT): { directory: string; jsonPath: string; sha256Path: string } {
  const directory = evidenceDirectory(baseDir);
  return {
    directory,
    jsonPath: path.join(directory, EVIDENCE_JSON_NAME),
    sha256Path: path.join(directory, EVIDENCE_SHA_NAME),
  };
}

export async function evidenceCollision(baseDir = UNCERTAIN_EVIDENCE_ROOT): Promise<boolean> {
  try {
    await stat(evidencePaths(baseDir).directory);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function writeUncertainEvidence(options: {
  binding: ResidualFreezeBinding;
  summary: LaneAForensicSummary;
  confirmationToken?: string;
  baseDir?: string;
  createdAt?: string;
}): Promise<EvidenceWriteResult> {
  if (options.confirmationToken !== UNCERTAIN_CONFIRMATION_TOKEN) {
    throw new Error("write-evidence requires the exact quarantine confirmation token");
  }
  const paths = evidencePaths(options.baseDir);
  if (await evidenceCollision(options.baseDir)) throw new Error(`evidence collision: ${paths.directory}`);
  const evidence = buildUncertainEvidence(options.binding, options.summary, options.createdAt);
  const raw = `${JSON.stringify(evidence, null, 2)}\n`;
  const rawSha256 = sha256Upper(raw);
  await mkdir(options.baseDir ?? UNCERTAIN_EVIDENCE_ROOT, { recursive: true });
  try {
    await mkdir(paths.directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`evidence collision: ${paths.directory}`);
    throw error;
  }
  await writeFile(paths.jsonPath, raw, { encoding: "utf8", flag: "wx" });
  await writeFile(paths.sha256Path, `${rawSha256}  ${EVIDENCE_JSON_NAME}\n`, { encoding: "utf8", flag: "wx" });
  return { ...paths, rawSha256, evidence };
}

function assertEvidenceSemantics(
  evidence: LaneAUncertainEvidence,
  binding: ResidualFreezeBinding,
): void {
  const targets = assertLaneATarget(binding);
  if (evidence.version !== UNCERTAIN_EVIDENCE_VERSION) throw new Error("uncertain evidence version mismatch");
  if (evidence.decision !== "LANE_A_EXECUTION_UNCERTAIN_QUARANTINE") throw new Error("uncertain evidence decision mismatch");
  if (evidence.lane !== "TRANSIENT") throw new Error("uncertain evidence lane mismatch");
  if (evidence.targetCount !== LANE_A_TARGET_COUNT) throw new Error("uncertain evidence target count mismatch");
  if (evidence.targetSetHash !== LANE_A_TARGET_SET_HASH) throw new Error("uncertain evidence target hash mismatch");
  if (JSON.stringify(evidence.candidateIds) !== JSON.stringify(targets)) throw new Error("uncertain evidence candidate identity mismatch");
  if (evidence.r1.candidateSetHash !== RESIDUAL_R1_HASHES.candidateSet) throw new Error("uncertain evidence R1 candidate hash mismatch");
  if (evidence.r1.frozenSha256 !== RESIDUAL_R1_HASHES.frozen) throw new Error("uncertain evidence R1 frozen hash mismatch");
  if (evidence.r1.manifestSha256 !== RESIDUAL_R1_HASHES.manifest) throw new Error("uncertain evidence R1 manifest hash mismatch");
  if (evidence.r1.exclusionAttestationSha256 !== RESIDUAL_R1_HASHES.attestation) throw new Error("uncertain evidence R1 attestation hash mismatch");
  if (evidence.outcome !== "QUARANTINED_EXECUTION_UNCERTAIN") throw new Error("uncertain evidence outcome mismatch");
  if (evidence.attempted !== "UNKNOWN") throw new Error("uncertain evidence attempted semantics mismatch");
  if (evidence.logicalAttemptCount !== "UNKNOWN") throw new Error("uncertain evidence logical attempt semantics mismatch");
  if (evidence.providerCall !== "UNKNOWN") throw new Error("uncertain evidence provider semantics mismatch");
  if (evidence.dbWrite !== 0) throw new Error("uncertain evidence dbWrite semantics mismatch");
  if (evidence.rerunAllowed !== false) throw new Error("uncertain evidence rerun semantics mismatch");
  if (evidence.humanReviewEligible !== false) throw new Error("uncertain evidence human review semantics mismatch");
  if (evidence.promoteEligible !== false) throw new Error("uncertain evidence promote semantics mismatch");
  if (evidence.appendOnly !== true) throw new Error("uncertain evidence append-only semantics mismatch");
  assertForensicPass(evidence.forensic);
}

export async function verifyUncertainEvidence(
  directory: string,
  binding?: ResidualFreezeBinding,
): Promise<LaneAUncertainEvidence> {
  const verifiedBinding = binding ?? (await loadAndVerifyResidualR1(RESIDUAL_R1_DIR));
  const paths = evidencePaths(path.dirname(directory));
  if (path.resolve(paths.directory) !== path.resolve(directory)) throw new Error("uncertain evidence directory identity mismatch");
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify([EVIDENCE_JSON_NAME, EVIDENCE_SHA_NAME].sort())) {
    throw new Error("uncertain evidence append-only directory contents mismatch");
  }
  const raw = await readFile(path.join(directory, EVIDENCE_JSON_NAME), "utf8");
  const sidecar = await readFile(path.join(directory, EVIDENCE_SHA_NAME), "utf8");
  const rawSha256 = sha256Upper(raw);
  const sidecarHash = sidecar.trim().split(/\s+/)[0]?.toUpperCase();
  if (sidecarHash !== rawSha256) throw new Error("uncertain evidence sidecar hash mismatch");
  let parsed: LaneAUncertainEvidence;
  try {
    parsed = JSON.parse(raw) as LaneAUncertainEvidence;
  } catch (error) {
    throw new Error(`uncertain evidence JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertEvidenceSemantics(parsed, verifiedBinding);
  return parsed;
}
