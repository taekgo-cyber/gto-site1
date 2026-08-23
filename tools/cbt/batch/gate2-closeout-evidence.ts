// Gate 2 Operational Closeout Evidence — scoped append-only attestation for the frozen 50 candidates.
// - Scope is exactly the frozen 50 candidate IDs -> their GeneratedQuestion rows -> attached GeneratedQuestionQA rows.
// - Scoped deletion/mutation fails; scoped new append passes; unrelated candidate append is ignored.
// - No provider/network calls; no production DB writes. DB is injected read-only.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  GATE2_OPERATIONAL_CLOSEOUT_VERSION,
  GATE2_BASE_SYSTEM_DECISION,
  GATE2_OPERATIONAL_CLOSEOUT_PASS,
  GATE2_OPERATIONAL_CLOSEOUT_FAIL,
  GATE2_CLOSEOUT_AUDIT_ERRORS,
  GATE2_CLOSEOUT_AUDIT_WARNINGS,
  GATE2_CLOSEOUT_EXCLUDED_COUNT,
  GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_IDS,
  GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH,
  GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH,
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES,
  GATE2_CLOSEOUT_TOTAL,
  GATE2_CLOSEOUT_PROMOTE_ELIGIBILITY,
  isGate2CloseoutExcludedCandidate,
  isGate2CloseoutExcludedGeneratedQuestionId,
} from "./gate2-closeout-policy";
import {
  FROZEN_GATE_TARGET_IDS,
  FROZEN_GATE_TARGET_HASH,
  FROZEN_GATE_TARGET_COUNT,
} from "./gate2-frozen-gate";
import {
  canonicalJsonString,
  hashCanonical,
  hashFileContent,
  verifyBoundRecoveryHistory,
  DEFAULT_RUNLOG_DIR,
  type PreManifest,
} from "./gate2-integrity-evidence";
import { readRunLog } from "./runlog";
import { hashTargetIds, type Gate2GeneratedQuestion } from "./gate2-state";

export type CloseoutBaselineEntry = PreManifest["baselineEntries"][number];

export type CloseoutScopedRow = {
  id: string;
  candidateQuestionId?: string | null;
  generatedQuestionId?: string | null;
  [key: string]: unknown;
};

export type CloseoutScopedRows = {
  generatedQuestions: readonly CloseoutScopedRow[];
  generatedQuestionQAs: readonly CloseoutScopedRow[];
};

export type CloseoutBaseline = {
  version: typeof GATE2_OPERATIONAL_CLOSEOUT_VERSION;
  createdAt: string;
  gateTargetHash: string;
  targetCount: number;
  targetIds: readonly string[];
  baselineIdentity: string;
  entries: readonly CloseoutBaselineEntry[];
  scopedRows: CloseoutScopedRows;
};

export type CloseoutCurrent = {
  version: typeof GATE2_OPERATIONAL_CLOSEOUT_VERSION;
  createdAt: string;
  gateTargetHash: string;
  targetCount: number;
  scopedIdentity: string;
  generatedQuestionsCount: number;
  generatedQuestionQAsCount: number;
  scopedRows: CloseoutScopedRows;
};

export type CloseoutAppendOnlyCheck = {
  appendOnlyPassed: boolean;
  deletedCount: number;
  mutatedCount: number;
  appendedCount: number;
  deletedIds: readonly string[];
  mutatedIds: readonly string[];
  appendedIds: readonly string[];
};

export type Gate2CloseoutManifest = {
  version: typeof GATE2_OPERATIONAL_CLOSEOUT_VERSION;
  createdAt: string;
  gateTargetHash: string;
  targetCount: number;
  baseSystemDecision: typeof GATE2_BASE_SYSTEM_DECISION;
  decision: typeof GATE2_OPERATIONAL_CLOSEOUT_PASS | typeof GATE2_OPERATIONAL_CLOSEOUT_FAIL;
  baselineIdentity: string;
  currentScopedIdentity: string;
  appendOnlyPassed: boolean;
  scopedDeletedCount: number;
  scopedMutatedCount: number;
  scopedAppendedCount: number;
  auditErrors: number;
  auditWarnings: number;
  circuitOpenCount: number;
  promoteEligibility: boolean;
  baselineArtifactHash: string;
  currentArtifactHash: string;
  reasons: readonly string[];
};

export type CloseoutDb = {
  generatedQuestion: { findMany(args?: unknown): Promise<unknown[]> };
  generatedQuestionQA: { findMany(args?: unknown): Promise<unknown[]> };
};

export function computeCloseoutBaselineIdentity(
  targetIds: readonly string[],
  latestByCandidate: ReadonlyMap<string, Gate2GeneratedQuestion>,
): { identity: string; entries: CloseoutBaselineEntry[] } {
  const entries = [...targetIds]
    .slice()
    .sort()
    .map((candidateQuestionId) => {
      const latest = latestByCandidate.get(candidateQuestionId);
      return {
        candidateQuestionId,
        latestGeneratedQuestionId: latest?.id ?? null,
        latestStatus: latest?.status ?? null,
        latestErrorCode: latest?.errorCode ?? null,
      };
    });
  return { identity: hashCanonical(entries), entries };
}

export function scopeRowsByCandidateSet(
  gqRows: readonly unknown[],
  qaRows: readonly unknown[],
  targetIds: readonly string[] = [...FROZEN_GATE_TARGET_IDS],
): CloseoutScopedRows {
  const targetSet = new Set(targetIds);
  const generatedQuestions = (gqRows as CloseoutScopedRow[]).filter((r) =>
    targetSet.has(String(r.candidateQuestionId ?? "")),
  );
  const scopedGqIds = new Set(generatedQuestions.map((r) => String(r.id ?? "")));
  const generatedQuestionQAs = (qaRows as CloseoutScopedRow[]).filter((r) =>
    scopedGqIds.has(String(r.generatedQuestionId ?? "")),
  );
  return { generatedQuestions, generatedQuestionQAs };
}

export function canonicalizeScopedRows(
  rows: readonly CloseoutScopedRow[],
): { sortedCanonical: readonly unknown[]; hash: string } {
  const sorted = [...rows].sort((a, b) => {
    const aId = String(a.id ?? "");
    const bId = String(b.id ?? "");
    return aId.localeCompare(bId);
  });
  const canonical = sorted.map((r) => canonicalizeValue(r));
  return { sortedCanonical: canonical, hash: hashCanonical(canonical) };
}

function canonicalizeValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalizeValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function computeCloseoutScopedIdentity(
  scopedRows: CloseoutScopedRows,
): string {
  const gq = canonicalizeScopedRows(scopedRows.generatedQuestions);
  const qa = canonicalizeScopedRows(scopedRows.generatedQuestionQAs);
  return hashCanonical({
    generatedQuestionsHash: gq.hash,
    generatedQuestionQAsHash: qa.hash,
  });
}

export function verifyScopedAppendOnly(
  baseline: CloseoutScopedRows,
  current: CloseoutScopedRows,
): CloseoutAppendOnlyCheck {
  const baselineGqMap = rowMap(baseline.generatedQuestions);
  const baselineQaMap = rowMap(baseline.generatedQuestionQAs);
  const currentGqMap = rowMap(current.generatedQuestions);
  const currentQaMap = rowMap(current.generatedQuestionQAs);

  const deletedIds: string[] = [];
  const mutatedIds: string[] = [];
  const appendedIds: string[] = [];

  for (const [id, baselineVal] of baselineGqMap) {
    const currentVal = currentGqMap.get(id);
    if (currentVal === undefined) {
      deletedIds.push(id);
    } else if (currentVal !== baselineVal) {
      mutatedIds.push(id);
    }
  }
  for (const [id, baselineVal] of baselineQaMap) {
    const currentVal = currentQaMap.get(id);
    if (currentVal === undefined) {
      deletedIds.push(id);
    } else if (currentVal !== baselineVal) {
      mutatedIds.push(id);
    }
  }
  for (const id of currentGqMap.keys()) {
    if (!baselineGqMap.has(id)) appendedIds.push(id);
  }
  for (const id of currentQaMap.keys()) {
    if (!baselineQaMap.has(id)) appendedIds.push(id);
  }

  return {
    appendOnlyPassed: deletedIds.length === 0 && mutatedIds.length === 0,
    deletedCount: deletedIds.length,
    mutatedCount: mutatedIds.length,
    appendedCount: appendedIds.length,
    deletedIds,
    mutatedIds,
    appendedIds,
  };
}

function rowMap(rows: readonly CloseoutScopedRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(String(row.id), canonicalJsonString(canonicalizeValue(row)));
  }
  return map;
}

export function buildCloseoutBaseline(
  targetIds: readonly string[],
  latestByCandidate: ReadonlyMap<string, Gate2GeneratedQuestion>,
  scopedRows: CloseoutScopedRows,
): CloseoutBaseline {
  const { identity, entries } = computeCloseoutBaselineIdentity(
    targetIds,
    latestByCandidate,
  );
  return {
    version: GATE2_OPERATIONAL_CLOSEOUT_VERSION,
    createdAt: new Date().toISOString(),
    gateTargetHash: FROZEN_GATE_TARGET_HASH,
    targetCount: targetIds.length,
    targetIds: [...targetIds],
    baselineIdentity: identity,
    entries,
    scopedRows,
  };
}

export function buildCloseoutCurrent(
  targetIds: readonly string[],
  scopedRows: CloseoutScopedRows,
): CloseoutCurrent {
  return {
    version: GATE2_OPERATIONAL_CLOSEOUT_VERSION,
    createdAt: new Date().toISOString(),
    gateTargetHash: FROZEN_GATE_TARGET_HASH,
    targetCount: targetIds.length,
    scopedIdentity: computeCloseoutScopedIdentity(scopedRows),
    generatedQuestionsCount: scopedRows.generatedQuestions.length,
    generatedQuestionQAsCount: scopedRows.generatedQuestionQAs.length,
    scopedRows,
  };
}

export function buildCloseoutManifest(
  evaluation: {
    decision: typeof GATE2_OPERATIONAL_CLOSEOUT_PASS | typeof GATE2_OPERATIONAL_CLOSEOUT_FAIL;
    targetCount?: number;
    baselineIdentity: string;
    currentScopedIdentity: string;
    appendOnlyPassed: boolean;
    scopedDeletedCount: number;
    scopedMutatedCount: number;
    scopedAppendedCount: number;
    auditErrors: number;
    auditWarnings: number;
    circuitOpenCount: number;
    promoteEligibility: boolean;
    reasons: readonly string[];
  },
): Gate2CloseoutManifest {
  return {
    version: GATE2_OPERATIONAL_CLOSEOUT_VERSION,
    createdAt: new Date().toISOString(),
    gateTargetHash: FROZEN_GATE_TARGET_HASH,
    targetCount: evaluation.targetCount ?? FROZEN_GATE_TARGET_IDS.length,
    baseSystemDecision: GATE2_BASE_SYSTEM_DECISION,
    decision: evaluation.decision,
    baselineIdentity: evaluation.baselineIdentity,
    currentScopedIdentity: evaluation.currentScopedIdentity,
    appendOnlyPassed: evaluation.appendOnlyPassed,
    scopedDeletedCount: evaluation.scopedDeletedCount,
    scopedMutatedCount: evaluation.scopedMutatedCount,
    scopedAppendedCount: evaluation.scopedAppendedCount,
    auditErrors: evaluation.auditErrors,
    auditWarnings: evaluation.auditWarnings,
    circuitOpenCount: evaluation.circuitOpenCount,
    promoteEligibility: evaluation.promoteEligibility,
    baselineArtifactHash: "",
    currentArtifactHash: "",
    reasons: [...evaluation.reasons],
  };
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, canonicalJsonString(value) + "\n", {
    encoding: "utf8",
    flag: "wx",
  });
}

export async function writeCloseoutArtifacts(
  outputDir: string,
  baseline: CloseoutBaseline,
  current: CloseoutCurrent,
  manifest: Gate2CloseoutManifest,
): Promise<void> {
  const baselineRaw = canonicalJsonString(baseline) + "\n";
  const currentRaw = canonicalJsonString(current) + "\n";
  await ensureDir(outputDir);
  await writeFile(path.join(outputDir, "closeout-baseline.json"), baselineRaw, { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(outputDir, "closeout-current.json"), currentRaw, { encoding: "utf8", flag: "wx" });
  const boundManifest = {
    ...manifest,
    baselineArtifactHash: hashFileContent(baselineRaw),
    currentArtifactHash: hashFileContent(currentRaw),
  } satisfies Gate2CloseoutManifest;
  const manifestRaw = canonicalJsonString(boundManifest) + "\n";
  await writeFile(path.join(outputDir, "closeout-manifest.json"), manifestRaw, { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(outputDir, "closeout-manifest.sha256"), hashFileContent(manifestRaw) + "\n", { encoding: "utf8", flag: "wx" });
}

export async function readGate2CloseoutManifest(
  manifestPath: string,
): Promise<Gate2CloseoutManifest> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as Gate2CloseoutManifest;
  if (parsed.version !== GATE2_OPERATIONAL_CLOSEOUT_VERSION) {
    throw new Error(`closeout manifest version mismatch: ${parsed.version}`);
  }
  if (parsed.gateTargetHash !== FROZEN_GATE_TARGET_HASH) {
    throw new Error(`closeout manifest gateTargetHash mismatch`);
  }
  if (parsed.baseSystemDecision !== GATE2_BASE_SYSTEM_DECISION) {
    throw new Error(`closeout manifest baseSystemDecision mismatch`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Shared full closeout evidence verifier — used by Gate2-derived promotion guard.
// Validates: PASS, base FAIL, frozen count/hash, exact excluded set and both
// hashes, artifact/snapshot hashes, append-only zero deletion/mutation,
// audit 0/0, bound recovery history. Rejects excluded candidate/GQ IDs.
// Unrelated paths are not required to provide a closeout artifact.
// ---------------------------------------------------------------------------
export type VerifyCloseoutEvidenceOptions = {
  manifestPath: string;
  runLogDir?: string;
  /** Candidate IDs being promoted; any excluded candidate fails. */
  candidateIds?: readonly string[];
  /** GeneratedQuestion IDs being promoted; any excluded GQ fails. */
  generatedQuestionIds?: readonly string[];
};

export type VerifyCloseoutEvidenceResult = {
  valid: boolean;
  reason?: string;
  manifest?: Gate2CloseoutManifest;
};

export async function verifyCloseoutEvidence(
  opts: VerifyCloseoutEvidenceOptions,
): Promise<VerifyCloseoutEvidenceResult> {
  const runLogDir = opts.runLogDir ?? DEFAULT_RUNLOG_DIR;
  let manifest: Gate2CloseoutManifest;
  try {
    manifest = await readGate2CloseoutManifest(opts.manifestPath);
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : String(e) };
  }

  const manifestDir = path.dirname(opts.manifestPath);

  // Read and verify artifact hashes.
  let baseline: CloseoutBaseline;
  let current: CloseoutCurrent;
  let manifestRaw: string;
  try {
    const baselineRaw = await readFile(path.join(manifestDir, "closeout-baseline.json"), "utf8");
    const currentRaw = await readFile(path.join(manifestDir, "closeout-current.json"), "utf8");
    manifestRaw = await readFile(opts.manifestPath, "utf8");
    baseline = JSON.parse(baselineRaw) as CloseoutBaseline;
    current = JSON.parse(currentRaw) as CloseoutCurrent;
    const manifestFileHash = (await readFile(path.join(manifestDir, "closeout-manifest.sha256"), "utf8")).trim();
    if (manifestFileHash !== hashFileContent(manifestRaw)) {
      return { valid: false, reason: "closeout manifest raw hash mismatch" };
    }
    if (manifest.baselineArtifactHash !== hashFileContent(baselineRaw)) {
      return { valid: false, reason: "baseline artifact raw hash mismatch" };
    }
    if (manifest.currentArtifactHash !== hashFileContent(currentRaw)) {
      return { valid: false, reason: "current artifact raw hash mismatch" };
    }
  } catch (e) {
    return { valid: false, reason: `closeout artifact read error: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (baseline.version !== GATE2_OPERATIONAL_CLOSEOUT_VERSION) {
    return { valid: false, reason: `baseline version mismatch` };
  }
  if (current.version !== GATE2_OPERATIONAL_CLOSEOUT_VERSION) {
    return { valid: false, reason: `current version mismatch` };
  }
  if (baseline.gateTargetHash !== FROZEN_GATE_TARGET_HASH) {
    return { valid: false, reason: `baseline gateTargetHash mismatch` };
  }
  if (current.gateTargetHash !== FROZEN_GATE_TARGET_HASH) {
    return { valid: false, reason: `current gateTargetHash mismatch` };
  }
  const baselineIdentityRecomputed = hashCanonical(baseline.entries);
  if (baselineIdentityRecomputed !== baseline.baselineIdentity) {
    return { valid: false, reason: `baseline identity recomputed mismatch` };
  }
  if (baseline.baselineIdentity !== manifest.baselineIdentity) {
    return { valid: false, reason: `baseline identity mismatch manifest` };
  }
  const currentScopedIdentityRecomputed = computeCloseoutScopedIdentity(current.scopedRows);
  if (currentScopedIdentityRecomputed !== current.scopedIdentity) {
    return { valid: false, reason: `current scoped identity recomputed mismatch` };
  }
  if (current.scopedIdentity !== manifest.currentScopedIdentity) {
    return { valid: false, reason: `current scoped identity mismatch manifest` };
  }

  // PASS and base FAIL.
  if (manifest.decision !== GATE2_OPERATIONAL_CLOSEOUT_PASS) {
    return { valid: false, reason: `closeout decision is ${manifest.decision} (expected ${GATE2_OPERATIONAL_CLOSEOUT_PASS})` };
  }
  if (manifest.baseSystemDecision !== GATE2_BASE_SYSTEM_DECISION) {
    return { valid: false, reason: `closeout baseSystemDecision is ${manifest.baseSystemDecision} (expected ${GATE2_BASE_SYSTEM_DECISION})` };
  }

  // Frozen target count/hash.
  if (manifest.targetCount !== FROZEN_GATE_TARGET_COUNT) {
    return { valid: false, reason: `closeout targetCount=${manifest.targetCount} expected ${FROZEN_GATE_TARGET_COUNT}` };
  }
  if (manifest.gateTargetHash !== FROZEN_GATE_TARGET_HASH) {
    return { valid: false, reason: `closeout gateTargetHash mismatch` };
  }

  // Exact excluded set and both hashes.
  if (GATE2_CLOSEOUT_EXCLUDED_ENTRIES.length !== GATE2_CLOSEOUT_EXCLUDED_COUNT) {
    return { valid: false, reason: `excluded entry count mismatch` };
  }
  if (GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_IDS.length !== GATE2_CLOSEOUT_EXCLUDED_COUNT) {
    return { valid: false, reason: `excluded candidate count mismatch` };
  }
  const excludedCandidateHash = hashTargetIds(GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_IDS);
  if (excludedCandidateHash !== GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH) {
    return { valid: false, reason: `excluded candidate hash mismatch` };
  }
  const excludedObjectHash = hashCanonical(GATE2_CLOSEOUT_EXCLUDED_ENTRIES);
  if (excludedObjectHash !== GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH) {
    return { valid: false, reason: `excluded object hash mismatch` };
  }

  // Append-only zero deletion/mutation: recompute from the stored artifact rows.
  const check = verifyScopedAppendOnly(baseline.scopedRows, current.scopedRows);
  if (manifest.appendOnlyPassed !== true || check.appendOnlyPassed !== true || check.deletedCount !== 0 || check.mutatedCount !== 0) {
    return { valid: false, reason: `append-only failed: deleted=${check.deletedCount} mutated=${check.mutatedCount}` };
  }

  // Audit 0/0.
  if (manifest.auditErrors !== GATE2_CLOSEOUT_AUDIT_ERRORS || manifest.auditWarnings !== GATE2_CLOSEOUT_AUDIT_WARNINGS) {
    return { valid: false, reason: `audit not clean: errors=${manifest.auditErrors} warnings=${manifest.auditWarnings}` };
  }

  // Bound recovery history.
  const historyCheck = await verifyBoundRecoveryHistory(runLogDir);
  if (!historyCheck.valid) {
    return { valid: false, reason: historyCheck.reason };
  }

  // Reject excluded candidate/GQ.
  for (const candidateId of opts.candidateIds ?? []) {
    if (isGate2CloseoutExcludedCandidate(candidateId)) {
      return { valid: false, reason: `excluded candidate rejected: ${candidateId}` };
    }
  }
  for (const generatedQuestionId of opts.generatedQuestionIds ?? []) {
    if (isGate2CloseoutExcludedGeneratedQuestionId(generatedQuestionId)) {
      return { valid: false, reason: `excluded generatedQuestionId rejected: ${generatedQuestionId}` };
    }
  }

  return { valid: true, manifest };
}
