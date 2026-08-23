// Gate 2 Integrity Evidence Binding — PRE + FINALIZE immutable evidence.
// - read-only DB snapshot, canonicalize, SHA-256, exclusive wx/no-overwrite
// - binding cryptographically references artifact hashes
// - never provider/network, never production DB write
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashTargetIds, selectLatestGeneratedQuestions, type Gate2GeneratedQuestion } from "./gate2-state";
import { getGate2RecoveryPolicy, type Gate2RecoveryPolicy } from "./gate2-recovery-policy";
import { FROZEN_GATE_TARGET_COUNT, FROZEN_GATE_TARGET_HASH, FROZEN_GATE_TARGET_IDS } from "./gate2-frozen-gate";
import { readRunLog } from "./runlog";
import type { Gate2IntegrityEvidence } from "./gate2-final-evaluator";

// ---------------------------------------------------------------------------
// Pure helper: recovery target semantics (shared finalize + verifier)
// - validates expected count (policy vs actual), duplicate, canonical sorted
//   exact equality, policy expected targetSetHash, run_start targetSetHash
// - same IDs different order => valid; wrong ID/duplicate/wrong hash => invalid
// ---------------------------------------------------------------------------
export function validateRecoveryTargetSemantics(
  runStart: { targets: readonly string[]; total: number; targetSetHash?: string | null },
  policy: Gate2RecoveryPolicy,
): string | null {
  const policyIds = policy.targets.map((t) => t.candidateId);
  if (runStart.targets.length !== policyIds.length) {
    return `run targets count mismatch: expected ${policyIds.length} got ${runStart.targets.length}`;
  }
  if (runStart.total !== policyIds.length) {
    return `run total mismatch: expected ${policyIds.length} got ${runStart.total}`;
  }
  if (new Set(runStart.targets).size !== runStart.targets.length) {
    return `run targets duplicate`;
  }
  const runSorted = [...runStart.targets].sort();
  const policySorted = [...policyIds].sort();
  if (runSorted.length !== policySorted.length || !runSorted.every((id, i) => id === policySorted[i])) {
    return `run targets mismatch policy: expected ${policySorted.join(",")} got ${runSorted.join(",")}`;
  }
  if (runStart.targetSetHash !== policy.targetSetHash) {
    return `run targetSetHash mismatch policy: expected ${policy.targetSetHash} got ${runStart.targetSetHash}`;
  }
  return null;
}

export const EVIDENCE_VERSION = "gate2-integrity-evidence-v1";
export const DEFAULT_EVIDENCE_BASE_DIR = path.join("data", "cbt", "evidence", "gate2");
export const DEFAULT_RUNLOG_DIR = path.join("data", "cbt", "runs");

// ---------------------------------------------------------------------------
// Mandatory bound recovery history — frozen aborted recovery runs.
// Each entry records the exact runId, canonical hashes of run_start/run_end,
// and the full runlog file hash. Empty/missing/tampered/forged history fails.
// These runs are aborted (passRelevant=false); no non-aborted run is required
// in this history because the relevant non-aborted run is bound separately.
// ---------------------------------------------------------------------------
export type Gate2BoundRecoveryHistoryEntry = {
  runId: string;
  runStartHash: string;
  runEndHash: string;
  runlogHash: string;
  aborted: true;
  passRelevant: false;
};

export const GATE2_BOUND_RECOVERY_HISTORY: readonly Gate2BoundRecoveryHistoryEntry[] = [
  {
    runId: "e765495f-1351-4a9f-bfde-e1730033710f",
    runStartHash: "64589AE425C2FB836FD87365FEB46C858BF96C8A7736535561A313523AA10A20",
    runEndHash: "B1F04E77AED7CBE9104E7E9EA005E650EE5BA66B6D5060B15AD3A5ABAF3CEF61",
    runlogHash: "21B318E51A0D2434D7E7EB4560DC76957A48BFAA14A2968DDE220896C5AE742F",
    aborted: true,
    passRelevant: false,
  },
  {
    runId: "aa5f41b4-27cd-45fa-bc0c-db7e7c5e2e16",
    runStartHash: "7ED249704BE6DC146AE4FED6A29246164712961F95E642D93DA5323B3DDA2B89",
    runEndHash: "8FDCAC30E4AAC7A2EB5389866847B1443FE0470908AA57C16D90F042AE825DDC",
    runlogHash: "6B221198B9F475E8D22D3BCD401B3ADF77304EC79740AA57F3BE44FE75667839",
    aborted: true,
    passRelevant: false,
  },
] as const;

export async function verifyBoundRecoveryHistory(
  runLogDir: string,
): Promise<{ valid: boolean; reason?: string; history: readonly Gate2BoundRecoveryHistoryEntry[] }> {
  for (const expected of GATE2_BOUND_RECOVERY_HISTORY) {
    let runLog: Awaited<ReturnType<typeof readRunLog>>;
    try {
      runLog = await readRunLog(runLogDir, expected.runId);
    } catch (e) {
      return { valid: false, reason: `bound recovery history missing runlog ${expected.runId}: ${e instanceof Error ? e.message : String(e)}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    if (!runLog.runStart) {
      return { valid: false, reason: `bound recovery history missing run_start for ${expected.runId}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    if (!runLog.runEnd) {
      return { valid: false, reason: `bound recovery history missing run_end for ${expected.runId}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    if (runLog.runEnd.aborted !== true) {
      return { valid: false, reason: `bound recovery history run ${expected.runId} is not aborted`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    const passRelevant = (runLog.runEnd as unknown as { passRelevant?: unknown }).passRelevant;
    if (passRelevant !== undefined && passRelevant !== false) {
      return { valid: false, reason: `bound recovery history run ${expected.runId} is passRelevant`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    if (expected.passRelevant !== false) {
      return { valid: false, reason: `bound recovery history policy is passRelevant`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    const runlogFilePath = runLogFilePath(runLogDir, expected.runId);
    let runlogRaw: string;
    try {
      runlogRaw = await readFile(runlogFilePath, "utf8");
    } catch (e) {
      return { valid: false, reason: `bound recovery history cannot read runlog ${expected.runId}: ${e instanceof Error ? e.message : String(e)}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    const runlogHash = hashFileContent(runlogRaw);
    if (runlogHash !== expected.runlogHash) {
      return { valid: false, reason: `bound recovery history runlog hash mismatch for ${expected.runId}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    const runStartHash = hashCanonical(runLog.runStart);
    const runEndHash = hashCanonical(runLog.runEnd);
    if (runStartHash !== expected.runStartHash) {
      return { valid: false, reason: `bound recovery history run_start hash mismatch for ${expected.runId}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
    if (runEndHash !== expected.runEndHash) {
      return { valid: false, reason: `bound recovery history run_end hash mismatch for ${expected.runId}`, history: GATE2_BOUND_RECOVERY_HISTORY };
    }
  }
  return { valid: true, history: GATE2_BOUND_RECOVERY_HISTORY };
}

// ---------------------------------------------------------------------------
// Canonicalization helpers
// ---------------------------------------------------------------------------

export function canonicalizeValue(value: unknown): unknown {
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

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function sha256HexUpper(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex").toUpperCase();
}

export function hashCanonical(value: unknown): string {
  return sha256HexUpper(canonicalJsonString(value));
}

export function hashFileContent(content: string): string {
  return sha256HexUpper(content);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreManifest = {
  version: typeof EVIDENCE_VERSION;
  evidenceId: string;
  createdAt: string;
  gateTargetHash: string;
  gateTargetCount: number;
  targetIds: readonly string[];
  baselineIdentity: string;
  baselineEntries: readonly { candidateQuestionId: string; latestGeneratedQuestionId: string | null; latestStatus: string | null; latestErrorCode: string | null }[];
  preSnapshotIdentity: string;
  preSnapshotGeneratedQuestionsHash: string;
  preSnapshotGeneratedQuestionQAsHash: string;
  preGeneratedQuestionsCount: number;
  preGeneratedQuestionQAsCount: number;
  lane: string | null;
  policyVersion: string | null;
  parentRunId: string | null;
  targetSetHash: string | null;
};

export type PostManifest = {
  version: typeof EVIDENCE_VERSION;
  evidenceId: string;
  runId: string;
  createdAt: string;
  runlogHash: string;
  postSnapshotIdentity: string;
  postSnapshotGeneratedQuestionsHash: string;
  postSnapshotGeneratedQuestionQAsHash: string;
  postGeneratedQuestionsCount: number;
  postGeneratedQuestionQAsCount: number;
  appendOnlyPassed: boolean;
  historicalMutationCount: number;
  targetExternalChangeCount: number;
  deletedCount: number;
  mutatedCount: number;
  appendedGeneratedQuestionsCount: number;
  appendedGeneratedQuestionQAsCount: number;
};

export type BindingManifest = {
  version: typeof EVIDENCE_VERSION;
  evidenceId: string;
  runId: string;
  createdAt: string;
  preManifestHash: string;
  postManifestHash: string;
  runlogHash: string;
  baselineIdentity: string;
  preSnapshotIdentity: string;
  postSnapshotIdentity: string;
  gateTargetHash: string;
  lane: string | null;
  policyVersion: string | null;
  parentRunId: string | null;
  targetSetHash: string | null;
};

export type FinalManifest = {
  version: typeof EVIDENCE_VERSION;
  evidenceId: string;
  createdAt: string;
  gateTargetHash: string;
  relevantRunIds: readonly string[];
  boundRecoveryHistory: readonly Gate2BoundRecoveryHistoryEntry[];
  baselineIdentity: string;
  preSnapshotIdentity: string;
  postSnapshotIdentity: string;
  appendOnlyPassed: boolean;
  historicalMutationCount: number;
  targetExternalChangeCount: number;
  // verification hashes
  preManifestHash: string;
  postManifestHash: string;
  bindingHash: string;
  runlogHash: string;
  integrityEvidence: Gate2IntegrityEvidence;
};

// DB interface for evidence — injectable for tests, no production write
export type IntegrityDb = {
  generatedQuestion: { findMany(args?: unknown): Promise<unknown[]> };
  generatedQuestionQA: { findMany(args?: unknown): Promise<unknown[]> };
};

// ---------------------------------------------------------------------------
// Baseline identity
// ---------------------------------------------------------------------------

export function computeBaselineIdentity(
  targetIds: readonly string[],
  latestByCandidate: ReadonlyMap<string, Gate2GeneratedQuestion>,
): { identity: string; entries: PreManifest["baselineEntries"] } {
  const entries = [...targetIds]
    .slice()
    .sort()
    .map((candidateId) => {
      const latest = latestByCandidate.get(candidateId);
      return {
        candidateQuestionId: candidateId,
        latestGeneratedQuestionId: latest?.id ?? null,
        latestStatus: latest?.status ?? null,
        latestErrorCode: latest?.errorCode ?? null,
      };
    });
  // canonicalize with explicit nulls and lexical keys already sorted
  const identity = hashCanonical(entries);
  return { identity, entries };
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

export function snapshotRowsCanonical(rows: readonly unknown[]): { sortedCanonical: unknown[]; hash: string } {
  // rows must have id for sorting
  const sorted = [...rows].sort((a, b) => {
    const aId = (a as { id?: string }).id ?? "";
    const bId = (b as { id?: string }).id ?? "";
    return aId.localeCompare(bId);
  });
  const canonical = sorted.map((row) => canonicalizeValue(row));
  const hash = hashCanonical(canonical);
  return { sortedCanonical: canonical, hash };
}

export function computeSnapshotIdentity(
  gqHash: string,
  qaHash: string,
): string {
  return hashCanonical({ generatedQuestionsHash: gqHash, generatedQuestionQAsHash: qaHash });
}

// ---------------------------------------------------------------------------
// Exclusive write helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function writeExclusiveJson(filePath: string, value: unknown): Promise<string> {
  const content = canonicalJsonString(value) + "\n";
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
  return hashFileContent(content);
}

async function writeExclusiveRaw(filePath: string, content: string): Promise<string> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
  return hashFileContent(content);
}

function runLogFilePath(dir: string, runId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error(`invalid runId ${runId}`);
  return path.join(dir, `${runId}.jsonl`);
}

// ---------------------------------------------------------------------------
// PRE creation
// ---------------------------------------------------------------------------

export type CreatePreOptions = {
  evidenceId?: string;
  targetIds: readonly string[];
  expectedGateTargetHash?: string; // validate against this, defaults to hash of targetIds? but we validate explicit
  gateTargetHashOverride?: string; // if not provided, compute
  evidenceBaseDir?: string;
  db: IntegrityDb;
  lane?: string | null;
  policyVersion?: string | null;
  parentRunId?: string | null;
  targetSetHash?: string | null;
  // for baseline: need GQ rows to compute latest
  fetchLatestRows?: () => Promise<Gate2GeneratedQuestion[]>;
};

export async function createPreEvidence(opts: CreatePreOptions): Promise<{ evidenceId: string; preManifest: PreManifest; preManifestHash: string; evidenceDir: string }> {
  const evidenceId = opts.evidenceId ?? randomUUID();
  const evidenceBaseDir = opts.evidenceBaseDir ?? DEFAULT_EVIDENCE_BASE_DIR;
  const evidenceDir = path.join(evidenceBaseDir, evidenceId);

  // Independent frozen Gate target lock — do not derive expected from input.
  const computedGateHash = hashTargetIds(opts.targetIds);
  if (opts.targetIds.length !== FROZEN_GATE_TARGET_COUNT) {
    throw new Error(`gate target count mismatch: expected ${FROZEN_GATE_TARGET_COUNT} got ${opts.targetIds.length}`);
  }
  if (new Set(opts.targetIds).size !== opts.targetIds.length) {
    throw new Error(`gate target duplicate detected`);
  }
  if (computedGateHash !== FROZEN_GATE_TARGET_HASH) {
    throw new Error(`gateTargetHash mismatch: expected ${FROZEN_GATE_TARGET_HASH} got ${computedGateHash}`);
  }
  // canonical exact ID equality against frozen source (order-sensitive hash already checked, sorted check defends against hash collision confusion)
  const sortedActual = [...opts.targetIds].sort();
  const sortedFrozen = [...FROZEN_GATE_TARGET_IDS].sort();
  if (sortedActual.length !== sortedFrozen.length || !sortedActual.every((id, i) => id === sortedFrozen[i])) {
    throw new Error(`gate target IDs mismatch frozen gate set`);
  }
  // expectedGateTargetHash / override must match frozen if provided (no self-derive bypass)
  if (opts.expectedGateTargetHash && opts.expectedGateTargetHash.toUpperCase() !== FROZEN_GATE_TARGET_HASH) {
    throw new Error(`expectedGateTargetHash does not match frozen gate hash`);
  }
  if (opts.gateTargetHashOverride && opts.gateTargetHashOverride.toUpperCase() !== FROZEN_GATE_TARGET_HASH) {
    throw new Error(`gateTargetHash override mismatch frozen`);
  }
  const gateTargetHash = computedGateHash;

  // fetch DB rows read-only
  const [allGqRowsRaw, allQaRowsRaw] = await Promise.all([
    opts.db.generatedQuestion.findMany(),
    opts.db.generatedQuestionQA.findMany(),
  ]);

  // compute baseline identity from latest per candidate
  let latestByCandidate: Map<string, Gate2GeneratedQuestion>;
  if (opts.fetchLatestRows) {
    const latestRows = await opts.fetchLatestRows();
    latestByCandidate = selectLatestGeneratedQuestions(latestRows);
  } else {
    // derive from allGqRowsRaw filtered to targetIds
    const filtered = (allGqRowsRaw as unknown as Gate2GeneratedQuestion[]).filter((r) => opts.targetIds.includes(r.candidateQuestionId));
    latestByCandidate = selectLatestGeneratedQuestions(filtered);
  }
  const { identity: baselineIdentity, entries: baselineEntries } = computeBaselineIdentity(opts.targetIds, latestByCandidate);

  // snapshot rows: canonicalize stable sorted
  const gqSnap = snapshotRowsCanonical(allGqRowsRaw as readonly unknown[]);
  const qaSnap = snapshotRowsCanonical(allQaRowsRaw as readonly unknown[]);
  const preSnapshotIdentity = computeSnapshotIdentity(gqSnap.hash, qaSnap.hash);

  const preManifest: PreManifest = {
    version: EVIDENCE_VERSION,
    evidenceId,
    createdAt: new Date().toISOString(),
    gateTargetHash,
    gateTargetCount: opts.targetIds.length,
    targetIds: [...opts.targetIds],
    baselineIdentity,
    baselineEntries,
    preSnapshotIdentity,
    preSnapshotGeneratedQuestionsHash: gqSnap.hash,
    preSnapshotGeneratedQuestionQAsHash: qaSnap.hash,
    preGeneratedQuestionsCount: (allGqRowsRaw as unknown[]).length,
    preGeneratedQuestionQAsCount: (allQaRowsRaw as unknown[]).length,
    lane: opts.lane ?? null,
    policyVersion: opts.policyVersion ?? null,
    parentRunId: opts.parentRunId ?? null,
    targetSetHash: opts.targetSetHash ?? null,
  };

  // write immutable artifacts with wx
  // order: snapshot files first, then manifest (so manifest hash covers snapshot hashes)
  const gqContent = canonicalJsonString(gqSnap.sortedCanonical) + "\n";
  const qaContent = canonicalJsonString(qaSnap.sortedCanonical) + "\n";
  // baseline content for extra attestation
  const baselineContent = canonicalJsonString(baselineEntries) + "\n";

  await writeExclusiveRaw(path.join(evidenceDir, "generatedQuestions.json"), gqContent);
  await writeExclusiveRaw(path.join(evidenceDir, "generatedQuestionQAs.json"), qaContent);
  await writeExclusiveRaw(path.join(evidenceDir, "baseline.json"), baselineContent);
  const preManifestHash = await writeExclusiveJson(path.join(evidenceDir, "pre.json"), preManifest);

  return { evidenceId, preManifest, preManifestHash, evidenceDir };
}

// ---------------------------------------------------------------------------
// FINALIZE
// ---------------------------------------------------------------------------

export type FinalizeOptions = {
  evidenceId: string;
  runId: string;
  evidenceBaseDir?: string;
  runLogDir?: string;
  db: IntegrityDb;
};

export async function finalizeEvidence(opts: FinalizeOptions): Promise<{
  postManifest: PostManifest;
  bindingManifest: BindingManifest;
  finalManifest: FinalManifest;
  evidenceDir: string;
}> {
  const evidenceBaseDir = opts.evidenceBaseDir ?? DEFAULT_EVIDENCE_BASE_DIR;
  const runLogDir = opts.runLogDir ?? DEFAULT_RUNLOG_DIR;
  const evidenceDir = path.join(evidenceBaseDir, opts.evidenceId);

  // validate pre exists and hashes match
  const prePath = path.join(evidenceDir, "pre.json");
  let preRaw: string;
  try {
    preRaw = await readFile(prePath, "utf8");
  } catch {
    throw new Error(`pre evidence not found for ${opts.evidenceId}`);
  }
  let preManifest: PreManifest;
  try {
    preManifest = JSON.parse(preRaw) as PreManifest;
  } catch {
    throw new Error(`pre manifest corrupt for ${opts.evidenceId}`);
  }
  if (preManifest.version !== EVIDENCE_VERSION || preManifest.evidenceId !== opts.evidenceId) {
    throw new Error(`pre manifest version/evidenceId mismatch`);
  }
  const preManifestHash = hashFileContent(preRaw);
  // verify snapshot files hashes match pre manifest
  const gqPreContent = await readFile(path.join(evidenceDir, "generatedQuestions.json"), "utf8");
  const qaPreContent = await readFile(path.join(evidenceDir, "generatedQuestionQAs.json"), "utf8");
  const baselineContent = await readFile(path.join(evidenceDir, "baseline.json"), "utf8");
  // recompute hashes from file content canonical? File already contains canonical JSON array string with newline.
  // Parse and re-hash canonical to ensure deterministic
  const gqPreParsed = JSON.parse(gqPreContent) as unknown[];
  const qaPreParsed = JSON.parse(qaPreContent) as unknown[];
  const baselineParsed = JSON.parse(baselineContent) as unknown;
  const gqPreHashRecomputed = hashCanonical(gqPreParsed);
  const qaPreHashRecomputed = hashCanonical(qaPreParsed);
  const baselineHashRecomputed = hashCanonical(baselineParsed);
  if (gqPreHashRecomputed !== preManifest.preSnapshotGeneratedQuestionsHash) throw new Error(`pre gq snapshot hash mismatch`);
  if (qaPreHashRecomputed !== preManifest.preSnapshotGeneratedQuestionQAsHash) throw new Error(`pre qa snapshot hash mismatch`);
  const preSnapshotIdentityRecomputed = computeSnapshotIdentity(gqPreHashRecomputed, qaPreHashRecomputed);
  if (preSnapshotIdentityRecomputed !== preManifest.preSnapshotIdentity) throw new Error(`preSnapshotIdentity mismatch`);
  if (baselineHashRecomputed !== preManifest.baselineIdentity) {
    // baselineIdentity is hash of baselineEntries, which is stored in baseline.json as entries array
    // verify
    if (hashCanonical(preManifest.baselineEntries) !== preManifest.baselineIdentity) throw new Error(`baselineIdentity mismatch with entries`);
    if (baselineHashRecomputed !== preManifest.baselineIdentity) throw new Error(`baseline file hash mismatch`);
  }

  // gate-wide identity: pre must match frozen gate (separate from recovery-run identity)
  if (preManifest.gateTargetHash !== FROZEN_GATE_TARGET_HASH) throw new Error(`gateTargetHash mismatch frozen: expected ${FROZEN_GATE_TARGET_HASH} got ${preManifest.gateTargetHash}`);
  if (preManifest.gateTargetCount !== FROZEN_GATE_TARGET_COUNT) throw new Error(`gateTargetCount mismatch frozen`);
  if (preManifest.targetIds.length !== FROZEN_GATE_TARGET_COUNT) throw new Error(`pre targetIds count mismatch frozen`);
  if (hashTargetIds(preManifest.targetIds) !== FROZEN_GATE_TARGET_HASH) throw new Error(`pre targetIds hash mismatch frozen`);
  if (new Set(preManifest.targetIds).size !== preManifest.targetIds.length) throw new Error(`pre targetIds duplicate`);
  {
    const sortedPre = [...preManifest.targetIds].sort();
    const sortedFrozen = [...FROZEN_GATE_TARGET_IDS].sort();
    if (sortedPre.length !== sortedFrozen.length || !sortedPre.every((id, i) => id === sortedFrozen[i])) {
      throw new Error(`pre targetIds mismatch frozen set`);
    }
  }

  // verify runlog: readRunLog, validate lane/policyVersion/parentRunId/targetCount/targetSetHash, require run_end and aborted !== true, hash runlog
  const runLog = await readRunLog(runLogDir, opts.runId);
  const runStart = runLog.runStart;
  // run_start must have lane/policyVersion/parentRunId/targetSetHash matching preManifest if set, or policy
  // infer expected lane from preManifest lane or policy lookup
  // For gate2 recovery, expected policy per lane
  const expectedLane: string | null = preManifest.lane;
  const expectedPolicyVersion: string | null = preManifest.policyVersion;
  const expectedParentRunId: string | null = preManifest.parentRunId;
  const expectedTargetSetHash: string | null = preManifest.targetSetHash;

  // If pre lane is specified, lookup policy to cross-check (gate-wide vs recovery-run separate)
  if (preManifest.lane) {
    const policy = getGate2RecoveryPolicy(preManifest.lane as "contract" | "provider");
    if (policy.policyVersion !== preManifest.policyVersion) throw new Error(`policyVersion mismatch`);
    if (policy.parentRunId !== preManifest.parentRunId) throw new Error(`parentRunId mismatch`);
    if (policy.targetSetHash !== preManifest.targetSetHash) throw new Error(`targetSetHash mismatch`);
    // also validate policy's own hash vs targets (defense)
    if (hashTargetIds(policy.targets.map((t) => t.candidateId)) !== policy.targetSetHash) throw new Error(`policy targetSetHash hash mismatch`);
  }

  // Verify runStart matches pre expectations if present
  if (expectedLane && runStart.lane !== expectedLane) throw new Error(`run lane mismatch: expected ${expectedLane} got ${runStart.lane}`);
  if (expectedPolicyVersion && runStart.policyVersion !== expectedPolicyVersion) throw new Error(`run policyVersion mismatch`);
  if (expectedParentRunId && runStart.parentRunId !== expectedParentRunId) throw new Error(`run parentRunId mismatch`);
  if (expectedTargetSetHash && runStart.targetSetHash !== expectedTargetSetHash) throw new Error(`run targetSetHash mismatch`);

  // Unconditional exact recovery-run target validation for bound policy (via shared pure helper)
  if (preManifest.lane) {
    const policy = getGate2RecoveryPolicy(preManifest.lane as "contract" | "provider");
    const violation = validateRecoveryTargetSemantics(runStart, policy);
    if (violation) throw new Error(violation);
  }

  if (!runLog.runEnd) throw new Error(`run_end missing for ${opts.runId}`);
  if (runLog.runEnd.aborted === true) throw new Error(`run aborted: ${runLog.runEnd.abortReason ?? "aborted"}`);

  // hash runlog file content raw
  const runlogFilePath = runLogFilePath(runLogDir, opts.runId);
  const runlogRaw = await readFile(runlogFilePath, "utf8");
  const runlogHash = hashFileContent(runlogRaw);

  // read post DB snapshot
  const [postGqRaw, postQaRaw] = await Promise.all([
    opts.db.generatedQuestion.findMany(),
    opts.db.generatedQuestionQA.findMany(),
  ]);
  const postGqSnap = snapshotRowsCanonical(postGqRaw as readonly unknown[]);
  const postQaSnap = snapshotRowsCanonical(postQaRaw as readonly unknown[]);
  const postSnapshotIdentity = computeSnapshotIdentity(postGqSnap.hash, postQaSnap.hash);

  // verify all PRE rows unchanged and only new append rows; fail on deletion/mutation
  // Build maps by id canonical string
  const preGqMap = new Map<string, string>();
  for (const row of gqPreParsed as { id: string }[]) {
    const id = (row as { id: string }).id;
    preGqMap.set(id, canonicalJsonString(row));
  }
  const preQaMap = new Map<string, string>();
  for (const row of qaPreParsed as { id: string }[]) {
    const id = (row as { id: string }).id;
    preQaMap.set(id, canonicalJsonString(row));
  }
  const postGqMap = new Map<string, string>();
  for (const row of postGqSnap.sortedCanonical as { id: string }[]) {
    const id = (row as { id: string }).id;
    postGqMap.set(id, canonicalJsonString(row));
  }
  const postQaMap = new Map<string, string>();
  for (const row of postQaSnap.sortedCanonical as { id: string }[]) {
    const id = (row as { id: string }).id;
    postQaMap.set(id, canonicalJsonString(row));
  }

  let deletedCount = 0;
  let mutatedCount = 0;
  for (const [id, preVal] of preGqMap) {
    const postVal = postGqMap.get(id);
    if (postVal === undefined) deletedCount += 1;
    else if (postVal !== preVal) mutatedCount += 1;
  }
  for (const [id, preVal] of preQaMap) {
    const postVal = postQaMap.get(id);
    if (postVal === undefined) deletedCount += 1;
    else if (postVal !== preVal) mutatedCount += 1;
  }

  const historicalMutationCount = deletedCount + mutatedCount;
  const targetExternalChangeCount = deletedCount + mutatedCount;
  // Also appended counts
  let appendedGq = 0;
  for (const id of postGqMap.keys()) if (!preGqMap.has(id)) appendedGq += 1;
  let appendedQa = 0;
  for (const id of postQaMap.keys()) if (!preQaMap.has(id)) appendedQa += 1;

  const appendOnlyPassed = deletedCount === 0 && mutatedCount === 0;

  const postManifest: PostManifest = {
    version: EVIDENCE_VERSION,
    evidenceId: opts.evidenceId,
    runId: opts.runId,
    createdAt: new Date().toISOString(),
    runlogHash,
    postSnapshotIdentity,
    postSnapshotGeneratedQuestionsHash: postGqSnap.hash,
    postSnapshotGeneratedQuestionQAsHash: postQaSnap.hash,
    postGeneratedQuestionsCount: postGqMap.size,
    postGeneratedQuestionQAsCount: postQaMap.size,
    appendOnlyPassed,
    historicalMutationCount,
    targetExternalChangeCount,
    deletedCount,
    mutatedCount,
    appendedGeneratedQuestionsCount: appendedGq,
    appendedGeneratedQuestionQAsCount: appendedQa,
  };

  // Write post snapshots exclusive
  const postGqContent = canonicalJsonString(postGqSnap.sortedCanonical) + "\n";
  const postQaContent = canonicalJsonString(postQaSnap.sortedCanonical) + "\n";
  await writeExclusiveRaw(path.join(evidenceDir, "postGeneratedQuestions.json"), postGqContent);
  await writeExclusiveRaw(path.join(evidenceDir, "postGeneratedQuestionQAs.json"), postQaContent);
  const postManifestHash = await writeExclusiveJson(path.join(evidenceDir, "post.json"), postManifest);

  const bindingManifest: BindingManifest = {
    version: EVIDENCE_VERSION,
    evidenceId: opts.evidenceId,
    runId: opts.runId,
    createdAt: new Date().toISOString(),
    preManifestHash,
    postManifestHash,
    runlogHash,
    baselineIdentity: preManifest.baselineIdentity,
    preSnapshotIdentity: preManifest.preSnapshotIdentity,
    postSnapshotIdentity,
    gateTargetHash: preManifest.gateTargetHash,
    lane: preManifest.lane,
    policyVersion: preManifest.policyVersion,
    parentRunId: preManifest.parentRunId,
    targetSetHash: preManifest.targetSetHash,
  };
  const bindingHash = await writeExclusiveJson(path.join(evidenceDir, "binding.json"), bindingManifest);

  const integrityEvidence: Gate2IntegrityEvidence = {
    gateTargetHash: preManifest.gateTargetHash,
    relevantRunIds: [opts.runId],
    baselineIdentity: preManifest.baselineIdentity,
    preSnapshotIdentity: preManifest.preSnapshotIdentity,
    postSnapshotIdentity,
    appendOnlyPassed,
    historicalMutationCount: postManifest.historicalMutationCount,
    targetExternalChangeCount: postManifest.targetExternalChangeCount,
  };

  const finalManifest: FinalManifest = {
    version: EVIDENCE_VERSION,
    evidenceId: opts.evidenceId,
    createdAt: new Date().toISOString(),
    gateTargetHash: preManifest.gateTargetHash,
    relevantRunIds: [opts.runId],
    boundRecoveryHistory: GATE2_BOUND_RECOVERY_HISTORY,
    baselineIdentity: preManifest.baselineIdentity,
    preSnapshotIdentity: preManifest.preSnapshotIdentity,
    postSnapshotIdentity,
    appendOnlyPassed,
    historicalMutationCount: postManifest.historicalMutationCount,
    targetExternalChangeCount: postManifest.targetExternalChangeCount,
    preManifestHash,
    postManifestHash,
    bindingHash,
    runlogHash,
    integrityEvidence,
  };
  await writeExclusiveJson(path.join(evidenceDir, "final-manifest.json"), finalManifest);

  // Enforce append-only failure closes binding? Even if appendOnlyFailed, we still produce manifests but they indicate failure; evaluator will FAIL.
  // The task says produce immutable binding/post/final manifest cryptographically referencing artifact hashes even if? We always produce.

  return { postManifest, bindingManifest, finalManifest, evidenceDir };
}

// ---------------------------------------------------------------------------
// Verification for evaluator CLI
// ---------------------------------------------------------------------------

export async function verifyEvidenceAtPath(
  evidencePath: string,
  opts?: { runLogDir?: string; evidenceBaseDir?: string },
): Promise<{ valid: boolean; evidence?: Gate2IntegrityEvidence; reason?: string; finalManifest?: FinalManifest }> {
  const runLogDir = opts?.runLogDir ?? DEFAULT_RUNLOG_DIR;
  let finalPath: string;
  // determine if path is file or directory
  try {
    const stat = await import("node:fs/promises").then((m) => m.stat(evidencePath));
    if (stat.isDirectory()) {
      finalPath = path.join(evidencePath, "final-manifest.json");
    } else {
      finalPath = evidencePath;
    }
  } catch {
    return { valid: false, reason: `evidence path not found: ${evidencePath}` };
  }
  let finalRaw: string;
  try {
    finalRaw = await readFile(finalPath, "utf8");
  } catch {
    return { valid: false, reason: `final manifest not found` };
  }
  let finalManifest: FinalManifest;
  try {
    finalManifest = JSON.parse(finalRaw) as FinalManifest;
  } catch {
    return { valid: false, reason: `final manifest corrupt` };
  }
  if (finalManifest.version !== EVIDENCE_VERSION) return { valid: false, reason: `version mismatch` };

  const evidenceDir = path.dirname(finalPath);
  try {
    const prePath = path.join(evidenceDir, "pre.json");
    const postPath = path.join(evidenceDir, "post.json");
    const bindingPath = path.join(evidenceDir, "binding.json");
    const preRaw = await readFile(prePath, "utf8");
    const postRaw = await readFile(postPath, "utf8");
    const bindingRaw = await readFile(bindingPath, "utf8");
    const preHash = hashFileContent(preRaw);
    const postHash = hashFileContent(postRaw);
    const bindingHash = hashFileContent(bindingRaw);
    if (preHash !== finalManifest.preManifestHash) return { valid: false, reason: `preManifestHash mismatch (tamper)` };
    if (postHash !== finalManifest.postManifestHash) return { valid: false, reason: `postManifestHash mismatch` };
    if (bindingHash !== finalManifest.bindingHash) return { valid: false, reason: `bindingHash mismatch` };
    const binding = JSON.parse(bindingRaw) as BindingManifest;
    if (binding.preManifestHash !== preHash) return { valid: false, reason: `binding pre hash mismatch` };
    if (binding.postManifestHash !== postHash) return { valid: false, reason: `binding post hash mismatch` };
    if (binding.runlogHash !== finalManifest.runlogHash) return { valid: false, reason: `binding runlog hash mismatch` };
    const runId = finalManifest.relevantRunIds[0];
    if (!runId) return { valid: false, reason: `no relevantRunId` };
    const runlogFile = runLogFilePath(runLogDir, runId);
    const runlogRaw = await readFile(runlogFile, "utf8");
    const runlogHash = hashFileContent(runlogRaw);
    if (runlogHash !== finalManifest.runlogHash) return { valid: false, reason: `runlog hash mismatch` };
    if (runlogHash !== binding.runlogHash) return { valid: false, reason: `binding runlog mismatch` };
    const pre = JSON.parse(preRaw) as PreManifest;
    const post = JSON.parse(postRaw) as PostManifest;
    // Require all artifacts same evidence identity and version
    if (pre.version !== EVIDENCE_VERSION || post.version !== EVIDENCE_VERSION || binding.version !== EVIDENCE_VERSION) return { valid: false, reason: `artifact version mismatch` };
    if (pre.evidenceId !== finalManifest.evidenceId) return { valid: false, reason: `pre evidenceId mismatch` };
    if (post.evidenceId !== finalManifest.evidenceId) return { valid: false, reason: `post evidenceId mismatch` };
    if (binding.evidenceId !== finalManifest.evidenceId) return { valid: false, reason: `binding evidenceId mismatch` };
    if (post.runId !== runId) return { valid: false, reason: `post runId mismatch` };
    if (binding.runId !== runId) return { valid: false, reason: `binding runId mismatch` };
    // Verify runlog binding provenance — fail-closed: require run_end and aborted !== true even if hashes/manifests are internally consistent
    const runLog = await readRunLog(runLogDir, runId);
    if (!runLog.runEnd) return { valid: false, reason: `run_end missing for ${runId}` };
    if (runLog.runEnd.aborted === true) return { valid: false, reason: `run aborted: ${runLog.runEnd.abortReason ?? "aborted"}` };
    if (runLog.runStart.runId !== runId) return { valid: false, reason: `runlog runId mismatch` };
    if (post.runlogHash !== runlogHash) return { valid: false, reason: `post runlogHash mismatch` };
    // Cross-check gate-wide identity (independent frozen)
    const computedGateHashFromPre = hashTargetIds(pre.targetIds);
    if (pre.gateTargetHash !== FROZEN_GATE_TARGET_HASH) return { valid: false, reason: `pre gateTargetHash not frozen` };
    if (finalManifest.gateTargetHash !== FROZEN_GATE_TARGET_HASH) return { valid: false, reason: `final gateTargetHash not frozen` };
    if (binding.gateTargetHash !== FROZEN_GATE_TARGET_HASH) return { valid: false, reason: `binding gateTargetHash not frozen` };
    if (computedGateHashFromPre !== FROZEN_GATE_TARGET_HASH) return { valid: false, reason: `pre targetIds hash not frozen` };
    if (pre.gateTargetCount !== FROZEN_GATE_TARGET_COUNT) return { valid: false, reason: `pre gateTargetCount mismatch` };
    if (pre.targetIds.length !== FROZEN_GATE_TARGET_COUNT) return { valid: false, reason: `pre targetIds length mismatch` };
    // lane/policy/parent/targetSetHash cross-check (recover-run identity separate from gate)
    if (pre.lane !== binding.lane) return { valid: false, reason: `lane mismatch pre vs binding` };
    if (pre.policyVersion !== binding.policyVersion) return { valid: false, reason: `policyVersion mismatch pre vs binding` };
    if (pre.parentRunId !== binding.parentRunId) return { valid: false, reason: `parentRunId mismatch pre vs binding` };
    if (pre.targetSetHash !== binding.targetSetHash) return { valid: false, reason: `targetSetHash mismatch pre vs binding` };
    if (pre.lane && runLog.runStart.lane !== pre.lane) return { valid: false, reason: `run lane mismatch` };
    if (pre.policyVersion && runLog.runStart.policyVersion !== pre.policyVersion) return { valid: false, reason: `run policyVersion mismatch` };
    if (pre.parentRunId && runLog.runStart.parentRunId !== pre.parentRunId) return { valid: false, reason: `run parentRunId mismatch` };
    if (pre.targetSetHash && runLog.runStart.targetSetHash !== pre.targetSetHash) return { valid: false, reason: `run targetSetHash mismatch` };
    // Independently revalidate bound recovery target semantics from verified runlog against frozen recovery policy (shared pure helper)
    if (pre.lane) {
      const policy = getGate2RecoveryPolicy(pre.lane as "contract" | "provider");
      const violation = validateRecoveryTargetSemantics(runLog.runStart, policy);
      if (violation) return { valid: false, reason: violation };
    }
    // snapshot identities recomputed
    const gqContent = await readFile(path.join(evidenceDir, "generatedQuestions.json"), "utf8");
    const qaContent = await readFile(path.join(evidenceDir, "generatedQuestionQAs.json"), "utf8");
    const baselineContent = await readFile(path.join(evidenceDir, "baseline.json"), "utf8");
    const postGqContent = await readFile(path.join(evidenceDir, "postGeneratedQuestions.json"), "utf8");
    const postQaContent = await readFile(path.join(evidenceDir, "postGeneratedQuestionQAs.json"), "utf8");
    const gqHash = hashCanonical(JSON.parse(gqContent));
    const qaHash = hashCanonical(JSON.parse(qaContent));
    const baselineParsed = JSON.parse(baselineContent) as unknown;
    const baselineHash = hashCanonical(baselineParsed);
    if (gqHash !== pre.preSnapshotGeneratedQuestionsHash) return { valid: false, reason: `pre gq hash mismatch` };
    if (qaHash !== pre.preSnapshotGeneratedQuestionQAsHash) return { valid: false, reason: `pre qa hash mismatch` };
    if (baselineHash !== pre.baselineIdentity) return { valid: false, reason: `baseline hash mismatch` };
    if (hashCanonical(pre.baselineEntries) !== pre.baselineIdentity) return { valid: false, reason: `baselineIdentity vs entries mismatch` };
    const preSnapshotIdentityRecomputed = computeSnapshotIdentity(gqHash, qaHash);
    if (preSnapshotIdentityRecomputed !== pre.preSnapshotIdentity) return { valid: false, reason: `preSnapshotIdentity recomputed mismatch` };
    if (pre.preSnapshotIdentity !== finalManifest.preSnapshotIdentity) return { valid: false, reason: `preSnapshotIdentity mismatch final` };
    if (pre.preSnapshotIdentity !== binding.preSnapshotIdentity) return { valid: false, reason: `preSnapshotIdentity mismatch binding` };
    if (pre.baselineIdentity !== finalManifest.baselineIdentity) return { valid: false, reason: `baselineIdentity mismatch final` };
    if (pre.baselineIdentity !== binding.baselineIdentity) return { valid: false, reason: `baselineIdentity mismatch binding` };
    const postGqHash = hashCanonical(JSON.parse(postGqContent));
    const postQaHash = hashCanonical(JSON.parse(postQaContent));
    if (postGqHash !== post.postSnapshotGeneratedQuestionsHash) return { valid: false, reason: `post gq hash mismatch` };
    if (postQaHash !== post.postSnapshotGeneratedQuestionQAsHash) return { valid: false, reason: `post qa hash mismatch` };
    const postSnapshotIdentityRecomputed = computeSnapshotIdentity(postGqHash, postQaHash);
    if (postSnapshotIdentityRecomputed !== post.postSnapshotIdentity) return { valid: false, reason: `postSnapshotIdentity recomputed mismatch` };
    if (post.postSnapshotIdentity !== finalManifest.postSnapshotIdentity) return { valid: false, reason: `postSnapshotIdentity mismatch final` };
    if (post.postSnapshotIdentity !== binding.postSnapshotIdentity) return { valid: false, reason: `postSnapshotIdentity mismatch binding` };
    // recompute preserved/appended/deleted/mutated counts from snapshots (cross-check)
    const gqPreParsed = JSON.parse(gqContent) as { id: string }[];
    const qaPreParsed = JSON.parse(qaContent) as { id: string }[];
    const gqPostParsed = JSON.parse(postGqContent) as { id: string }[];
    const qaPostParsed = JSON.parse(postQaContent) as { id: string }[];
    // counts vs files
    // use canonical maps as finalize
    const preGqMap = new Map<string, string>();
    for (const row of gqPreParsed) preGqMap.set((row as { id: string }).id, canonicalJsonString(row));
    const preQaMap = new Map<string, string>();
    for (const row of qaPreParsed) preQaMap.set((row as { id: string }).id, canonicalJsonString(row));
    const postGqMap = new Map<string, string>();
    for (const row of gqPostParsed as unknown as { id: string }[]) postGqMap.set((row as { id: string }).id, canonicalJsonString(row));
    const postQaMap = new Map<string, string>();
    for (const row of qaPostParsed as unknown as { id: string }[]) postQaMap.set((row as { id: string }).id, canonicalJsonString(row));
    let deletedCount = 0;
    let mutatedCount = 0;
    for (const [id, preVal] of preGqMap) {
      const postVal = postGqMap.get(id);
      if (postVal === undefined) deletedCount += 1;
      else if (postVal !== preVal) mutatedCount += 1;
    }
    for (const [id, preVal] of preQaMap) {
      const postVal = postQaMap.get(id);
      if (postVal === undefined) deletedCount += 1;
      else if (postVal !== preVal) mutatedCount += 1;
    }
    let appendedGq = 0;
    for (const id of postGqMap.keys()) if (!preGqMap.has(id)) appendedGq += 1;
    let appendedQa = 0;
    for (const id of postQaMap.keys()) if (!preQaMap.has(id)) appendedQa += 1;
    const historicalMutationCount = deletedCount + mutatedCount;
    const targetExternalChangeCount = deletedCount + mutatedCount;
    const appendOnlyPassed = deletedCount === 0 && mutatedCount === 0;
    // cross-check post counts
    if (post.deletedCount !== deletedCount) return { valid: false, reason: `deletedCount mismatch` };
    if (post.mutatedCount !== mutatedCount) return { valid: false, reason: `mutatedCount mismatch` };
    if (post.historicalMutationCount !== historicalMutationCount) return { valid: false, reason: `historicalMutationCount mismatch` };
    if (post.targetExternalChangeCount !== targetExternalChangeCount) return { valid: false, reason: `targetExternalChangeCount mismatch` };
    if (post.appendedGeneratedQuestionsCount !== appendedGq) return { valid: false, reason: `appendedGq mismatch` };
    if (post.appendedGeneratedQuestionQAsCount !== appendedQa) return { valid: false, reason: `appendedQa mismatch` };
    if (post.appendOnlyPassed !== appendOnlyPassed) return { valid: false, reason: `appendOnlyPassed mismatch post` };
    if (post.postGeneratedQuestionsCount !== postGqMap.size) return { valid: false, reason: `postGeneratedQuestionsCount mismatch` };
    if (post.postGeneratedQuestionQAsCount !== postQaMap.size) return { valid: false, reason: `postGeneratedQuestionQAsCount mismatch` };
    // cross-check final counts/semantic fields
    if (finalManifest.appendOnlyPassed !== appendOnlyPassed) return { valid: false, reason: `final appendOnlyPassed mismatch` };
    if (finalManifest.historicalMutationCount !== historicalMutationCount) return { valid: false, reason: `final historicalMutationCount mismatch` };
    if (finalManifest.targetExternalChangeCount !== targetExternalChangeCount) return { valid: false, reason: `final targetExternalChangeCount mismatch` };
    // Bound recovery history must match the frozen exact entries; forged/empty/tampered fails.
    if (canonicalJsonString(finalManifest.boundRecoveryHistory) !== canonicalJsonString(GATE2_BOUND_RECOVERY_HISTORY)) {
      return { valid: false, reason: `boundRecoveryHistory tamper or missing` };
    }
    // Construct evaluator-facing evidence from verified artifacts (do not trust final boolean/count)
    const verifiedEvidence: Gate2IntegrityEvidence = {
      gateTargetHash: pre.gateTargetHash,
      relevantRunIds: [runId],
      baselineIdentity: pre.baselineIdentity,
      preSnapshotIdentity: pre.preSnapshotIdentity,
      postSnapshotIdentity: post.postSnapshotIdentity,
      appendOnlyPassed,
      historicalMutationCount,
      targetExternalChangeCount,
    };
    // Every Gate2IntegrityEvidence field in final must match verified
    const fe = finalManifest.integrityEvidence;
    if (fe.gateTargetHash !== verifiedEvidence.gateTargetHash) return { valid: false, reason: `integrityEvidence gateTargetHash tamper` };
    if (fe.baselineIdentity !== verifiedEvidence.baselineIdentity) return { valid: false, reason: `integrityEvidence baselineIdentity tamper` };
    if (fe.preSnapshotIdentity !== verifiedEvidence.preSnapshotIdentity) return { valid: false, reason: `integrityEvidence preSnapshotIdentity tamper` };
    if (fe.postSnapshotIdentity !== verifiedEvidence.postSnapshotIdentity) return { valid: false, reason: `integrityEvidence postSnapshotIdentity tamper` };
    if (fe.appendOnlyPassed !== verifiedEvidence.appendOnlyPassed) return { valid: false, reason: `integrityEvidence appendOnlyPassed tamper` };
    if (fe.historicalMutationCount !== verifiedEvidence.historicalMutationCount) return { valid: false, reason: `integrityEvidence historicalMutationCount tamper` };
    if (fe.targetExternalChangeCount !== verifiedEvidence.targetExternalChangeCount) return { valid: false, reason: `integrityEvidence targetExternalChangeCount tamper` };
    if (fe.relevantRunIds.length !== 1 || fe.relevantRunIds[0] !== runId) return { valid: false, reason: `integrityEvidence relevantRunIds tamper` };
    // final top-level must match verified as well
    if (finalManifest.gateTargetHash !== verifiedEvidence.gateTargetHash) return { valid: false, reason: `final gateTargetHash tamper` };
    if (finalManifest.baselineIdentity !== verifiedEvidence.baselineIdentity) return { valid: false, reason: `final baselineIdentity tamper` };
    if (finalManifest.preSnapshotIdentity !== verifiedEvidence.preSnapshotIdentity) return { valid: false, reason: `final preSnapshotIdentity tamper` };
    if (finalManifest.postSnapshotIdentity !== verifiedEvidence.postSnapshotIdentity) return { valid: false, reason: `final postSnapshotIdentity tamper` };
    return { valid: true, evidence: verifiedEvidence, finalManifest };
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function createEvidenceId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Verify immutable PRE evidence against a current live DB snapshot.
// Loads the pre.json and its snapshot files, verifies all hashes, and then
// compares the stored PRE snapshot to the current DB snapshot. Never compares
// a freshly-created PRE to itself (current-vs-current). Missing or tampered PRE
// artifacts fail closed.
// ---------------------------------------------------------------------------
export async function verifyPreEvidenceAgainstCurrentDb(
  evidenceDir: string,
  db: IntegrityDb,
): Promise<{ valid: boolean; preManifest?: PreManifest; reason?: string; differences: string[] }> {
  let preRaw: string;
  let preManifest: PreManifest;
  try {
    preRaw = await readFile(path.join(evidenceDir, "pre.json"), "utf8");
    preManifest = JSON.parse(preRaw) as PreManifest;
  } catch (e) {
    return { valid: false, reason: `PRE evidence missing or corrupt: ${e instanceof Error ? e.message : String(e)}`, differences: [] };
  }
  if (preManifest.version !== EVIDENCE_VERSION) {
    return { valid: false, reason: `PRE evidence version mismatch`, differences: [] };
  }
  const preManifestHash = hashFileContent(preRaw);
  let gqContent: string;
  let qaContent: string;
  let baselineContent: string;
  try {
    gqContent = await readFile(path.join(evidenceDir, "generatedQuestions.json"), "utf8");
    qaContent = await readFile(path.join(evidenceDir, "generatedQuestionQAs.json"), "utf8");
    baselineContent = await readFile(path.join(evidenceDir, "baseline.json"), "utf8");
  } catch (e) {
    return { valid: false, reason: `PRE evidence snapshot missing: ${e instanceof Error ? e.message : String(e)}`, differences: [] };
  }
  const gqParsed = JSON.parse(gqContent) as unknown[];
  const qaParsed = JSON.parse(qaContent) as unknown[];
  const baselineParsed = JSON.parse(baselineContent) as unknown;
  const gqHash = hashCanonical(gqParsed);
  const qaHash = hashCanonical(qaParsed);
  const baselineHash = hashCanonical(baselineParsed);
  if (gqHash !== preManifest.preSnapshotGeneratedQuestionsHash) {
    return { valid: false, reason: `PRE generatedQuestions hash mismatch`, differences: [] };
  }
  if (qaHash !== preManifest.preSnapshotGeneratedQuestionQAsHash) {
    return { valid: false, reason: `PRE generatedQuestionQAs hash mismatch`, differences: [] };
  }
  if (baselineHash !== preManifest.baselineIdentity) {
    return { valid: false, reason: `PRE baseline hash mismatch`, differences: [] };
  }
  const preSnapshotIdentity = computeSnapshotIdentity(gqHash, qaHash);
  if (preSnapshotIdentity !== preManifest.preSnapshotIdentity) {
    return { valid: false, reason: `PRE snapshot identity mismatch`, differences: [] };
  }
  if (preManifest.gateTargetHash !== FROZEN_GATE_TARGET_HASH) {
    return { valid: false, reason: `PRE gateTargetHash mismatch`, differences: [] };
  }
  if (preManifest.gateTargetCount !== FROZEN_GATE_TARGET_COUNT) {
    return { valid: false, reason: `PRE gateTargetCount mismatch`, differences: [] };
  }
  if (preManifest.targetIds.length !== FROZEN_GATE_TARGET_COUNT) {
    return { valid: false, reason: `PRE targetIds count mismatch`, differences: [] };
  }
  if (hashTargetIds(preManifest.targetIds) !== FROZEN_GATE_TARGET_HASH) {
    return { valid: false, reason: `PRE targetIds hash mismatch`, differences: [] };
  }
  const sortedPre = [...preManifest.targetIds].sort();
  const sortedFrozen = [...FROZEN_GATE_TARGET_IDS].sort();
  if (sortedPre.length !== sortedFrozen.length || !sortedPre.every((id, i) => id === sortedFrozen[i])) {
    return { valid: false, reason: `PRE targetIds mismatch frozen set`, differences: [] };
  }

  // Current live DB snapshot read-only.
  const [currentGqRaw, currentQaRaw] = await Promise.all([
    db.generatedQuestion.findMany(),
    db.generatedQuestionQA.findMany(),
  ]);
  const currentGqSnap = snapshotRowsCanonical(currentGqRaw as readonly unknown[]);
  const currentQaSnap = snapshotRowsCanonical(currentQaRaw as readonly unknown[]);
  const currentSnapshotIdentity = computeSnapshotIdentity(currentGqSnap.hash, currentQaSnap.hash);

  const differences: string[] = [];
  if (currentGqSnap.hash !== preManifest.preSnapshotGeneratedQuestionsHash) {
    differences.push(`generatedQuestionsHash changed: PRE ${preManifest.preSnapshotGeneratedQuestionsHash} vs CURRENT ${currentGqSnap.hash}`);
  }
  if (currentQaSnap.hash !== preManifest.preSnapshotGeneratedQuestionQAsHash) {
    differences.push(`generatedQuestionQAsHash changed: PRE ${preManifest.preSnapshotGeneratedQuestionQAsHash} vs CURRENT ${currentQaSnap.hash}`);
  }
  if (currentSnapshotIdentity !== preManifest.preSnapshotIdentity) {
    differences.push(`snapshotIdentity changed: PRE ${preManifest.preSnapshotIdentity} vs CURRENT ${currentSnapshotIdentity}`);
  }

  return { valid: differences.length === 0, preManifest, differences };
}
