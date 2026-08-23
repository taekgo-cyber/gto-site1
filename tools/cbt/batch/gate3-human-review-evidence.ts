// Gate 3 Phase 3A — immutable exact QA_PASSED freeze and human-review export.
// This module is read-only against the DB and never calls a provider or writes DB rows.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashCanonical, hashFileContent } from "./gate2-integrity-evidence";
import {
  FROZEN_GATE_TARGET_HASH,
  FROZEN_GATE_TARGET_IDS,
  FROZEN_GATE_TARGET_COUNT,
} from "./gate2-frozen-gate";
import { verifyCloseoutEvidence, type CloseoutCurrent } from "./gate2-closeout-evidence";
import { canonicalJsonString } from "./gate2-integrity-evidence";

export const GATE3_HUMAN_REVIEW_VERSION = "gate3-human-review-v1";
export const DEFAULT_GATE3_EVIDENCE_DIR = path.join("data", "cbt", "evidence", "gate3-human-review");

type Row = Record<string, unknown> & { id: string; candidateQuestionId?: string | null; generatedQuestionId?: string | null; createdAt?: Date | string };

export type Gate3Db = {
  generatedQuestion: { findMany(args?: unknown): Promise<unknown[]> };
  generatedQuestionQA: { findMany(args?: unknown): Promise<unknown[]> };
};

export type Gate3ReviewEntry = {
  candidateId: string;
  generatedQuestionId: string;
  latestQaId: string;
  status: "QA_PASSED";
  question: string | null;
  options: unknown;
  answers: unknown;
  explanation: string | null;
  category: string | null;
  difficulty: string | null;
  factSourceMapping: unknown;
  qa: {
    id: string;
    isPass: boolean | null;
    hasHallucination: boolean | null;
    isCopyrightSafe: boolean | null;
    criticalFlaws: unknown;
    qaFeedback: string | null;
    evaluationScores: unknown;
    errorCode: string | null;
    errorMessage: string | null;
  };
  disposition: "UNREVIEWED";
  humanNote: null;
};

export type Gate3ReviewArtifact = {
  version: typeof GATE3_HUMAN_REVIEW_VERSION;
  reviewId: string;
  createdAt: string;
  gateTargetHash: string;
  gateTargetCount: number;
  gate3TargetSetHash: string;
  gate3ReviewSnapshotHash: string;
  entries: readonly Gate3ReviewEntry[];
};

export type Gate3FrozenArtifact = {
  version: typeof GATE3_HUMAN_REVIEW_VERSION;
  reviewId: string;
  createdAt: string;
  sourceCloseoutManifestPath: string;
  sourceCloseoutManifestHash: string;
  sourceCloseoutCurrentPath: string;
  sourceCloseoutCurrentHash: string;
  gateTargetHash: string;
  gateTargetCount: number;
  gate3TargetSetHash: string;
  entries: readonly Pick<Gate3ReviewEntry, "candidateId" | "generatedQuestionId" | "latestQaId" | "status">[];
};

export type Gate3Manifest = {
  version: typeof GATE3_HUMAN_REVIEW_VERSION;
  reviewId: string;
  createdAt: string;
  gateTargetHash: string;
  gateTargetCount: number;
  gate3TargetSetHash: string;
  gate3ReviewSnapshotHash: string;
  entryCount: number;
  dispositionCounts: { UNREVIEWED: number; HUMAN_ACCEPT: number; HUMAN_REJECT: number };
  dbWrite: false;
  closeoutDecision: "GATE2_OPERATIONAL_CLOSEOUT_PASS";
  closeoutBaseSystemDecision: "FAIL";
  sourceCloseoutManifestHash: string;
  sourceCloseoutCurrentHash: string;
  reasons: readonly string[];
};

function asRow(value: unknown): Row {
  return value as Row;
}

function timeOf(row: Row): number {
  const value = row.createdAt;
  return value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
}

function latestBy<T extends Row>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const prior = result.get(k);
    if (!prior || timeOf(row) > timeOf(prior) || (timeOf(row) === timeOf(prior) && row.id > prior.id)) result.set(k, row);
  }
  return result;
}

function reviewPayload(entries: readonly Gate3ReviewEntry[]): unknown {
  return entries.map((entry) => ({
    candidateId: entry.candidateId,
    generatedQuestionId: entry.generatedQuestionId,
    latestQaId: entry.latestQaId,
    status: entry.status,
    question: entry.question,
    options: entry.options,
    answers: entry.answers,
    explanation: entry.explanation,
    category: entry.category,
    difficulty: entry.difficulty,
    factSourceMapping: entry.factSourceMapping,
    qa: entry.qa,
  }));
}

export function deriveGate3Entries(
  closeout: CloseoutCurrent,
  liveGeneratedQuestions: readonly unknown[],
  liveQAs: readonly unknown[],
): Gate3ReviewEntry[] {
  if (closeout.gateTargetHash !== FROZEN_GATE_TARGET_HASH || closeout.targetCount !== FROZEN_GATE_TARGET_COUNT) {
    throw new Error("Gate2 closeout frozen target identity mismatch");
  }
  const closeoutGqs = closeout.scopedRows.generatedQuestions.map(asRow);
  const closeoutQas = closeout.scopedRows.generatedQuestionQAs.map(asRow);
  const frozenTargetSet = new Set(FROZEN_GATE_TARGET_IDS);
  if (closeoutGqs.some((row) => !frozenTargetSet.has(String(row.candidateQuestionId ?? "")))) {
    throw new Error("Gate3 closeout contains a Gate50-outside candidate");
  }
  const closeoutLatest = latestBy(closeoutGqs, (row) => String(row.candidateQuestionId ?? ""));
  const liveGqs = liveGeneratedQuestions.map(asRow);
  const liveLatest = latestBy(liveGqs, (row) => String(row.candidateQuestionId ?? ""));
  const sourcePassed = FROZEN_GATE_TARGET_IDS
    .map((candidateId) => closeoutLatest.get(candidateId))
    .filter((row): row is Row => Boolean(row && row.status === "QA_PASSED"));
  if (sourcePassed.length !== 39) throw new Error(`Gate3 QA_PASSED source count mismatch: ${sourcePassed.length}`);
  const sourceQaByGq = latestBy(closeoutQas, (row) => String(row.generatedQuestionId ?? ""));
  const liveQaByGq = latestBy(liveQAs.map(asRow), (row) => String(row.generatedQuestionId ?? ""));
  const entries = sourcePassed.map((source) => {
    const candidateId = String(source.candidateQuestionId);
    const live = liveLatest.get(candidateId);
    if (!live || live.id !== source.id || live.status !== "QA_PASSED") throw new Error(`Gate3 live GQ drift: ${candidateId}`);
    const sourceQa = sourceQaByGq.get(source.id);
    const liveQa = liveQaByGq.get(source.id);
    if (!sourceQa || !liveQa || liveQa.id !== sourceQa.id) throw new Error(`Gate3 latest QA drift: ${source.id}`);
    const entry = {
      candidateId,
      generatedQuestionId: source.id,
      latestQaId: sourceQa.id,
      status: "QA_PASSED" as const,
      question: (source.questionText as string | null | undefined) ?? null,
      options: source.choices ?? null,
      answers: source.answers ?? null,
      explanation: (source.explanation as string | null | undefined) ?? null,
      category: (source.category as string | null | undefined) ?? null,
      difficulty: (source.difficulty as string | null | undefined) ?? null,
      factSourceMapping: source.factSourceMapping ?? null,
      qa: {
        id: sourceQa.id,
        isPass: (sourceQa.isPass as boolean | null | undefined) ?? null,
        hasHallucination: (sourceQa.hasHallucination as boolean | null | undefined) ?? null,
        isCopyrightSafe: (sourceQa.isCopyrightSafe as boolean | null | undefined) ?? null,
        criticalFlaws: sourceQa.criticalFlaws ?? null,
        qaFeedback: (sourceQa.qaFeedback as string | null | undefined) ?? null,
        evaluationScores: sourceQa.evaluationScores ?? null,
        errorCode: (sourceQa.errorCode as string | null | undefined) ?? null,
        errorMessage: (sourceQa.errorMessage as string | null | undefined) ?? null,
      },
      disposition: "UNREVIEWED" as const,
      humanNote: null,
    } satisfies Gate3ReviewEntry;
    if (canonicalJsonString(reviewPayload([entry])) !== canonicalJsonString(reviewPayload([{ ...entry, question: live.questionText ?? null, options: live.choices ?? null, answers: live.answers ?? null, explanation: live.explanation ?? null, category: live.category ?? null, difficulty: live.difficulty ?? null, factSourceMapping: live.factSourceMapping ?? null } as Gate3ReviewEntry]))) {
      throw new Error(`Gate3 live GQ content drift: ${candidateId}`);
    }
    return entry;
  });
  if (new Set(entries.map((entry) => entry.candidateId)).size !== 39 || new Set(entries.map((entry) => entry.generatedQuestionId)).size !== 39) throw new Error("Gate3 duplicate identity");
  return entries;
}

export async function loadGate3Source(currentPath: string, manifestPath: string): Promise<{ current: CloseoutCurrent; manifestHash: string; currentHash: string }> {
  const [currentRaw, manifestRaw] = await Promise.all([readFile(currentPath, "utf8"), readFile(manifestPath, "utf8")]);
  const verified = await verifyCloseoutEvidence({ manifestPath });
  if (!verified.valid) throw new Error(`Gate2 closeout verifier failed: ${verified.reason ?? "unknown"}`);
  const current = JSON.parse(currentRaw) as CloseoutCurrent;
  const manifest = JSON.parse(manifestRaw) as { decision?: string; baseSystemDecision?: string; gateTargetHash?: string; targetCount?: number };
  if (manifest.decision !== "GATE2_OPERATIONAL_CLOSEOUT_PASS" || manifest.baseSystemDecision !== "FAIL" || manifest.gateTargetHash !== FROZEN_GATE_TARGET_HASH || manifest.targetCount !== FROZEN_GATE_TARGET_COUNT) throw new Error("Gate2 closeout manifest is not valid for Gate3");
  return { current, manifestHash: hashFileContent(manifestRaw), currentHash: hashFileContent(currentRaw) };
}

function markdown(artifact: Gate3ReviewArtifact): string {
  const lines = [`# Gate 3 Human Review Package`, ``, `- reviewId: ${artifact.reviewId}`, `- target count: ${artifact.entries.length}`, `- gate3TargetSetHash: ${artifact.gate3TargetSetHash}`, `- gate3ReviewSnapshotHash: ${artifact.gate3ReviewSnapshotHash}`, ``, `> All dispositions are initially UNREVIEWED. No DB write was performed.`, ``];
  for (const [index, entry] of artifact.entries.entries()) {
    lines.push(`## ${index + 1}. ${entry.generatedQuestionId}`, ``, `- candidateId: ${entry.candidateId}`, `- latestQaId: ${entry.latestQaId}`, `- disposition: UNREVIEWED`, ``, `### Question`, ``, entry.question ?? "(null)", ``, `### Options`, ``, "```json", JSON.stringify(entry.options, null, 2), "```", ``, `- answers: ${JSON.stringify(entry.answers)}`, `- explanation: ${entry.explanation ?? "(null)"}`, `- QA isPass: ${String(entry.qa.isPass)}`, `- QA criticalFlaws: ${JSON.stringify(entry.qa.criticalFlaws)}`, ``, `---`, ``);
  }
  return lines.join("\n");
}

async function writeExclusive(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, canonicalJsonString(value) + "\n", { encoding: "utf8", flag: "wx" });
}

export async function buildGate3ReviewArtifacts(options: {
  db: Gate3Db;
  closeoutCurrentPath?: string;
  closeoutManifestPath?: string;
  outputBaseDir?: string;
  reviewId?: string;
}): Promise<{ reviewId: string; outputDir: string; frozen: Gate3FrozenArtifact; review: Gate3ReviewArtifact; manifest: Gate3Manifest }> {
  const currentPath = options.closeoutCurrentPath ?? path.join("data", "cbt", "evidence", "gate2-closeout", "closeout-current.json");
  const manifestPath = options.closeoutManifestPath ?? path.join("data", "cbt", "evidence", "gate2-closeout", "closeout-manifest.json");
  const source = await loadGate3Source(currentPath, manifestPath);
  const candidates = FROZEN_GATE_TARGET_IDS;
  const [liveGqs, liveQAs] = await Promise.all([
    options.db.generatedQuestion.findMany({ where: { candidateQuestionId: { in: candidates } } }),
    options.db.generatedQuestionQA.findMany({}),
  ]);
  const entries = deriveGate3Entries(source.current, liveGqs, liveQAs);
  const gate3TargetSetHash = hashCanonical(entries.map((entry) => ({ candidateId: entry.candidateId, generatedQuestionId: entry.generatedQuestionId, latestQaId: entry.latestQaId })));
  const gate3ReviewSnapshotHash = hashCanonical(reviewPayload(entries));
  const reviewId = options.reviewId ?? `gate3-${gate3TargetSetHash.slice(0, 16).toLowerCase()}`;
  const createdAt = new Date().toISOString();
  const review: Gate3ReviewArtifact = { version: GATE3_HUMAN_REVIEW_VERSION, reviewId, createdAt, gateTargetHash: FROZEN_GATE_TARGET_HASH, gateTargetCount: FROZEN_GATE_TARGET_COUNT, gate3TargetSetHash, gate3ReviewSnapshotHash, entries };
  const frozen: Gate3FrozenArtifact = { version: GATE3_HUMAN_REVIEW_VERSION, reviewId, createdAt, sourceCloseoutManifestPath: manifestPath, sourceCloseoutManifestHash: source.manifestHash, sourceCloseoutCurrentPath: currentPath, sourceCloseoutCurrentHash: source.currentHash, gateTargetHash: FROZEN_GATE_TARGET_HASH, gateTargetCount: FROZEN_GATE_TARGET_COUNT, gate3TargetSetHash, entries: entries.map(({ candidateId, generatedQuestionId, latestQaId, status }) => ({ candidateId, generatedQuestionId, latestQaId, status })) };
  const manifest: Gate3Manifest = { version: GATE3_HUMAN_REVIEW_VERSION, reviewId, createdAt, gateTargetHash: FROZEN_GATE_TARGET_HASH, gateTargetCount: FROZEN_GATE_TARGET_COUNT, gate3TargetSetHash, gate3ReviewSnapshotHash, entryCount: entries.length, dispositionCounts: { UNREVIEWED: entries.length, HUMAN_ACCEPT: 0, HUMAN_REJECT: 0 }, dbWrite: false, closeoutDecision: "GATE2_OPERATIONAL_CLOSEOUT_PASS", closeoutBaseSystemDecision: "FAIL", sourceCloseoutManifestHash: source.manifestHash, sourceCloseoutCurrentHash: source.currentHash, reasons: [] };
  const outputDir = path.join(options.outputBaseDir ?? DEFAULT_GATE3_EVIDENCE_DIR, reviewId);
  await mkdir(outputDir, { recursive: true });
  await writeExclusive(path.join(outputDir, "gate3-frozen.json"), frozen);
  await writeExclusive(path.join(outputDir, "gate3-review.json"), review);
  await writeFile(path.join(outputDir, "gate3-review.md"), markdown(review), { encoding: "utf8", flag: "wx" });
  const manifestRaw = canonicalJsonString(manifest) + "\n";
  await writeFile(path.join(outputDir, "gate3-manifest.json"), manifestRaw, { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(outputDir, "gate3-manifest.sha256"), hashFileContent(manifestRaw) + "\n", { encoding: "utf8", flag: "wx" });
  return { reviewId, outputDir, frozen, review, manifest };
}

export async function verifyGate3ReviewArtifacts(outputDir: string): Promise<{ valid: boolean; reason?: string; manifest?: Gate3Manifest }> {
  try {
    const manifestRaw = await readFile(path.join(outputDir, "gate3-manifest.json"), "utf8");
    const sidecar = (await readFile(path.join(outputDir, "gate3-manifest.sha256"), "utf8")).trim();
    if (sidecar !== hashFileContent(manifestRaw)) return { valid: false, reason: "Gate3 manifest sidecar mismatch" };
    const manifest = JSON.parse(manifestRaw) as Gate3Manifest;
    const review = JSON.parse(await readFile(path.join(outputDir, "gate3-review.json"), "utf8")) as Gate3ReviewArtifact;
    const frozen = JSON.parse(await readFile(path.join(outputDir, "gate3-frozen.json"), "utf8")) as Gate3FrozenArtifact;
    if (manifest.version !== GATE3_HUMAN_REVIEW_VERSION || manifest.entryCount !== 39 || manifest.gateTargetHash !== FROZEN_GATE_TARGET_HASH || manifest.gateTargetCount !== FROZEN_GATE_TARGET_COUNT || manifest.dbWrite !== false) return { valid: false, reason: "Gate3 manifest identity mismatch" };
    if (review.entries.length !== 39 || frozen.entries.length !== 39 || review.gate3TargetSetHash !== manifest.gate3TargetSetHash || review.gate3ReviewSnapshotHash !== manifest.gate3ReviewSnapshotHash) return { valid: false, reason: "Gate3 artifact count/hash mismatch" };
    if (frozen.gateTargetHash !== manifest.gateTargetHash || frozen.gateTargetCount !== manifest.gateTargetCount || frozen.gate3TargetSetHash !== manifest.gate3TargetSetHash) return { valid: false, reason: "Gate3 frozen artifact identity mismatch" };
    const frozenIdentity = frozen.entries.map(({ candidateId, generatedQuestionId, latestQaId }) => ({ candidateId, generatedQuestionId, latestQaId }));
    const reviewIdentity = review.entries.map(({ candidateId, generatedQuestionId, latestQaId }) => ({ candidateId, generatedQuestionId, latestQaId }));
    if (new Set(reviewIdentity.map((entry) => entry.candidateId)).size !== 39 || new Set(reviewIdentity.map((entry) => entry.generatedQuestionId)).size !== 39) return { valid: false, reason: "Gate3 duplicate target identity" };
    if (hashCanonical(frozenIdentity) !== hashCanonical(reviewIdentity)) return { valid: false, reason: "Gate3 frozen/review identity mismatch" };
    if (hashCanonical(reviewPayload(review.entries)) !== review.gate3ReviewSnapshotHash) return { valid: false, reason: "Gate3 review snapshot hash mismatch" };
    if (hashCanonical(review.entries.map((entry) => ({ candidateId: entry.candidateId, generatedQuestionId: entry.generatedQuestionId, latestQaId: entry.latestQaId }))) !== review.gate3TargetSetHash) return { valid: false, reason: "Gate3 target set hash mismatch" };
    if (review.entries.some((entry) => entry.status !== "QA_PASSED" || entry.disposition !== "UNREVIEWED" || entry.humanNote !== null)) return { valid: false, reason: "Gate3 initial disposition/status mismatch" };
    return { valid: true, manifest };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
