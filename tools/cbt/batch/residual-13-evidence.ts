import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FROZEN_GATE_TARGET_IDS } from "./gate2-frozen-gate";

export type ResidualLane = "TRANSIENT" | "SEMANTIC";
export type ResidualOutcome =
  | "QA_PASSED"
  | "QUARANTINED_FAILED"
  | "QUARANTINED_QA_FAILED";

export const RESIDUAL_R1_DIR = path.join(
  "data",
  "cbt",
  "evidence",
  "residual-13",
  "residual-r1-ab55d9b7f4c3",
);
export const RESIDUAL_COUNT = 13 as const;
export const RESIDUAL_R1_HASHES = {
  frozen: "D5BA747BA3AC56D744718D3151FDC3C22252B765F5E1041C7EEFB52ED23D6CDB",
  manifest: "35877B9071A9E04055C8456D7CC71261B46EFEAD99EEDCC066C2B2FE6356CA93",
  attestation: "E685A61994F778FAE63AC170CF375703DA810F4B5ED63BDB780D91F76AE54F5E",
  candidateSet: "AB55D9B7F4C32BF34A1F0CA00A3C0FE885A7C321E55159600CB63FF95853DDF9",
  core: "2EADAD37BB1E5DB7A1A3E69F8D0EAA87DB737C1E631369C1EB03C5315B18C0A4",
  extended: "71DD23364A3B4CC43362F7FC9BFBF5B79CA85713079D0552EBE6A790B542FF9E",
} as const;

const TRANSIENT_SOURCE_IDS = new Set([
  "92611",
  "92623",
  "92950",
  "92951",
  "92955",
  "92957",
  "93022",
  "93029",
  "93030",
]);
const SEMANTIC_SOURCE_IDS = new Set(["92612", "92626", "92961", "93027"]);

export type ResidualFrozenEntry = {
  ordinal: number;
  candidateId: string;
  sourceQuestionId: string;
  category: string;
  candidateCreatedAt: string;
  latestGeneratedQuestionId: string;
  latestStatus: "FAILED" | "QA_FAILED";
  latestErrorCode: string | null;
  latestQaId: string | null;
  latestQaIsPass: boolean | null;
  latestQaErrorCode: string | null;
  insideGate50: boolean;
  recommendedLane: "TRANSIENT_RETRY_CANDIDATE" | "SEMANTIC_REGEN_CANDIDATE";
  [key: string]: unknown;
};

export type ResidualFreezeBinding = {
  freezeId: string;
  frozenHash: string;
  manifestHash: string;
  exclusionAttestationHash: string;
  candidateSetHash: string;
  coreObjectHash: string;
  extendedRowHash: string;
  entryCount: typeof RESIDUAL_COUNT;
  entries: readonly ResidualFrozenEntry[];
};

export type ResidualLiveSnapshot = {
  capturedAt: string;
  entries: readonly ResidualFrozenEntry[];
  candidateCount: number;
  generatedQuestionCount: number;
  qaCount: number;
  candidateFingerprints: Record<string, string>;
  historicalGqFingerprints: Record<string, string>;
  historicalQaFingerprints: Record<string, string>;
};

export type ResidualVerificationResult = {
  ok: boolean;
  reasons: string[];
};

export type ResidualHistoricalRow = {
  id: string;
  candidateId: string;
  fingerprint: string;
};

export type AppendOnlyVerificationResult = {
  ok: boolean;
  reasons: string[];
  unexpectedCandidateIds: string[];
  deletedIds: string[];
  mutatedIds: string[];
};

export type ResidualEvidence = {
  version: "residual-13-r3-evidence-v1";
  runType: "residual_13_bounded_generation";
  lane: ResidualLane;
  freezeId: string;
  frozenHash: string;
  manifestHash: string;
  exclusionAttestationHash: string;
  targetSetHash: string;
  targets: readonly string[];
  targetCount: number;
  concurrency: 1;
  attemptBudgetPerCandidate: 1;
  provider: "zen";
  model: "deepseek-v4-flash";
  generationPromptVersion: "step8-question-gen-v1.1";
  qaPromptVersion: "step8-auto-qa-v3.1";
  attemptedCount: number;
  passedCount: number;
  quarantinedCount: number;
  incompleteCount: number;
  resolutionComplete: boolean;
  itemResults: readonly {
    candidateId: string;
    sourceQuestionId: string;
    outcome: ResidualOutcome | null;
    attempted: boolean;
    logicalAttemptCount: 0 | 1;
  }[];
  appendOnly: AppendOnlyVerificationResult;
};

function sha256Upper(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();
}

function canonicalIds(entries: readonly ResidualFrozenEntry[]): string {
  return entries.map((entry) => entry.candidateId).join("\n") + "\n";
}

function laneForSource(sourceQuestionId: string): ResidualLane | null {
  if (TRANSIENT_SOURCE_IDS.has(sourceQuestionId)) return "TRANSIENT";
  if (SEMANTIC_SOURCE_IDS.has(sourceQuestionId)) return "SEMANTIC";
  return null;
}

function validateEntries(entries: readonly ResidualFrozenEntry[]): string[] {
  const reasons: string[] = [];
  const gate50 = new Set(FROZEN_GATE_TARGET_IDS);
  if (entries.length !== RESIDUAL_COUNT) reasons.push(`entry count mismatch: expected ${RESIDUAL_COUNT} got ${entries.length}`);
  if (new Set(entries.map((entry) => entry.candidateId)).size !== entries.length) reasons.push("duplicate candidateId");
  if (new Set(entries.map((entry) => entry.sourceQuestionId)).size !== entries.length) reasons.push("duplicate sourceQuestionId");
  entries.forEach((entry, index) => {
    if (entry.ordinal !== index + 1) reasons.push(`ordinal mismatch at ${index}`);
    if (entry.insideGate50 || gate50.has(entry.candidateId)) reasons.push(`Gate50 intersection: ${entry.candidateId}`);
    if (!laneForSource(entry.sourceQuestionId)) reasons.push(`unknown lane source: ${entry.sourceQuestionId}`);
    const expectedLane = laneForSource(entry.sourceQuestionId);
    const actualLane = entry.recommendedLane.startsWith("TRANSIENT") ? "TRANSIENT" : "SEMANTIC";
    if (expectedLane !== actualLane) reasons.push(`lane mismatch: ${entry.candidateId}`);
    if (entry.latestStatus !== "FAILED" && entry.latestStatus !== "QA_FAILED") reasons.push(`non-retryable latest status: ${entry.candidateId}`);
  });
  if (sha256Upper(canonicalIds(entries)) !== RESIDUAL_R1_HASHES.candidateSet) reasons.push("candidate set hash mismatch");
  return reasons;
}

export async function loadAndVerifyResidualR1(baseDir = RESIDUAL_R1_DIR): Promise<ResidualFreezeBinding> {
  const dir = path.resolve(baseDir);
  const frozenRaw = await readFile(path.join(dir, "residual-frozen.json"), "utf8");
  const manifestRaw = await readFile(path.join(dir, "residual-manifest.json"), "utf8");
  const manifestSidecar = await readFile(path.join(dir, "residual-manifest.sha256"), "utf8");
  const attestationRaw = await readFile(path.join(dir, "residual-exclusion-attestation.json"), "utf8");
  const attestationSidecar = await readFile(path.join(dir, "residual-exclusion-attestation.sha256"), "utf8");
  const actual = {
    frozen: sha256Upper(frozenRaw),
    manifest: sha256Upper(manifestRaw),
    attestation: sha256Upper(attestationRaw),
  };
  if (actual.frozen !== RESIDUAL_R1_HASHES.frozen) throw new Error("R1 frozen artifact hash mismatch");
  if (actual.manifest !== RESIDUAL_R1_HASHES.manifest) throw new Error("R1 manifest hash mismatch");
  if (actual.attestation !== RESIDUAL_R1_HASHES.attestation) throw new Error("R1 attestation hash mismatch");
  if (!manifestSidecar.toUpperCase().includes(actual.manifest)) throw new Error("R1 manifest sidecar mismatch");
  if (!attestationSidecar.toUpperCase().includes(actual.attestation)) throw new Error("R1 attestation sidecar mismatch");

  const frozen = JSON.parse(frozenRaw) as { freezeId?: string; decision?: string; solApprovedReconstruction?: boolean; entries?: ResidualFrozenEntry[]; candidateIdHash?: string; coreObjectHash?: string; extendedRowHash?: string };
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  const attestation = JSON.parse(attestationRaw) as Record<string, unknown>;
  if (frozen.freezeId !== "residual-r1-ab55d9b7f4c3" || frozen.decision !== "RECONSTRUCTED_RESIDUAL_13_OPERATIONAL_FREEZE_PASS" || frozen.solApprovedReconstruction !== true) throw new Error("R1 decision/provenance mismatch");
  if (!Array.isArray(frozen.entries)) throw new Error("R1 entries missing");
  const entryReasons = validateEntries(frozen.entries);
  if (entryReasons.length) throw new Error(`R1 entry validation failed: ${entryReasons.join("; ")}`);
  for (const [field, expected] of [["artifactSha256", RESIDUAL_R1_HASHES.frozen], ["candidateIdHash", RESIDUAL_R1_HASHES.candidateSet], ["coreObjectHash", RESIDUAL_R1_HASHES.core], ["extendedRowHash", RESIDUAL_R1_HASHES.extended]] as const) {
    const frozenValue = (frozen as Record<string, unknown>)[field];
    if (manifest[field] !== expected && frozenValue !== expected) throw new Error(`R1 ${field} mismatch`);
  }
  if (manifest.residualCount !== RESIDUAL_COUNT || manifest.solApprovedReconstruction !== true) throw new Error("R1 manifest metadata mismatch");
  if (attestation.exclusionProofValid !== true || attestation.includedIfIgnored !== 14 || attestation.documentedResidualCount !== RESIDUAL_COUNT) throw new Error("R1 exclusion attestation mismatch");
  return {
    freezeId: frozen.freezeId,
    frozenHash: actual.frozen,
    manifestHash: actual.manifest,
    exclusionAttestationHash: actual.attestation,
    candidateSetHash: RESIDUAL_R1_HASHES.candidateSet,
    coreObjectHash: RESIDUAL_R1_HASHES.core,
    extendedRowHash: RESIDUAL_R1_HASHES.extended,
    entryCount: RESIDUAL_COUNT,
    entries: frozen.entries,
  };
}

export function laneEntries(binding: ResidualFreezeBinding, lane: ResidualLane): readonly ResidualFrozenEntry[] {
  const entries = binding.entries.filter((entry) => (laneForSource(entry.sourceQuestionId) === lane));
  const expected = lane === "TRANSIENT" ? 9 : 4;
  if (entries.length !== expected) throw new Error(`lane count mismatch: ${lane}`);
  return entries;
}

export function verifyFrozenAgainstLive(binding: ResidualFreezeBinding, live: ResidualLiveSnapshot): ResidualVerificationResult {
  const reasons = [...validateEntries(binding.entries)];
  if (live.candidateCount !== RESIDUAL_COUNT) reasons.push("live candidate count mismatch");
  if (live.entries.length !== RESIDUAL_COUNT) reasons.push("live entry count mismatch");
  const liveById = new Map(live.entries.map((entry) => [entry.candidateId, entry]));
  for (const expected of binding.entries) {
    const actual = liveById.get(expected.candidateId);
    if (!actual) { reasons.push(`live candidate missing: ${expected.candidateId}`); continue; }
    for (const field of ["sourceQuestionId", "latestGeneratedQuestionId", "latestStatus", "latestErrorCode", "latestQaId", "latestQaIsPass", "latestQaErrorCode"] as const) {
      if (actual[field] !== expected[field]) reasons.push(`live latest-state mismatch: ${expected.candidateId}/${field}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function verifyAppendOnly(
  beforeGq: readonly ResidualHistoricalRow[],
  afterGq: readonly ResidualHistoricalRow[],
  beforeQa: readonly ResidualHistoricalRow[],
  afterQa: readonly ResidualHistoricalRow[],
  frozenCandidateIds: readonly string[],
): AppendOnlyVerificationResult {
  const reasons: string[] = [];
  const mutatedIds: string[] = [];
  const deletedIds: string[] = [];
  const unexpectedCandidateIds: string[] = [];
  const budgetViolations: string[] = [];
  const check = (before: readonly ResidualHistoricalRow[], after: readonly ResidualHistoricalRow[], label: string) => {
    const beforeMap = new Map(before.map((row) => [row.id, row]));
    const afterMap = new Map(after.map((row) => [row.id, row]));
    for (const [id, row] of beforeMap) {
      const current = afterMap.get(id);
      if (!current) deletedIds.push(`${label}:${id}`);
      else if (current.fingerprint !== row.fingerprint) mutatedIds.push(`${label}:${id}`);
    }
    const newByCandidate = new Map<string, number>();
    for (const row of after) {
      if (!beforeMap.has(row.id)) {
        if (!frozenCandidateIds.includes(row.candidateId)) unexpectedCandidateIds.push(`${label}:${row.id}`);
        newByCandidate.set(row.candidateId, (newByCandidate.get(row.candidateId) ?? 0) + 1);
      }
    }
    for (const [candidateId, count] of newByCandidate) if (count > 1) budgetViolations.push(`${label}:${candidateId}`);
  };
  check(beforeGq, afterGq, "gq");
  check(beforeQa, afterQa, "qa");
  if (deletedIds.length) reasons.push("historical deletion detected");
  if (mutatedIds.length) reasons.push("historical mutation detected");
  if (unexpectedCandidateIds.length) reasons.push("unexpected candidate append detected");
  if (budgetViolations.length) reasons.push("append attempt budget exceeded");
  return { ok: reasons.length === 0, reasons, unexpectedCandidateIds, deletedIds, mutatedIds };
}
