import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGate3ReviewArtifacts, deriveGate3Entries, loadGate3Source, verifyGate3ReviewArtifacts } from "../gate3-human-review-evidence";
import type { CloseoutCurrent } from "../gate2-closeout-evidence";
import { FROZEN_GATE_TARGET_IDS, FROZEN_GATE_TARGET_HASH } from "../gate2-frozen-gate";
import { canonicalJsonString, hashFileContent } from "../gate2-integrity-evidence";

type TestRow = { id: string; candidateQuestionId?: string; generatedQuestionId?: string; status?: string; createdAt: Date; [key: string]: unknown };
function closeout(rows: TestRow[], qas: TestRow[]) {
  return { version: "gate2-operational-closeout-v1", createdAt: "2026-01-01T00:00:00.000Z", gateTargetHash: FROZEN_GATE_TARGET_HASH, targetCount: 50, scopedIdentity: "test", generatedQuestionsCount: rows.length, generatedQuestionQAsCount: qas.length, scopedRows: { generatedQuestions: rows, generatedQuestionQAs: qas } } as CloseoutCurrent;
}
function gq(candidateQuestionId: string, id: string, status = "QA_PASSED"): TestRow { return { id, candidateQuestionId, status, createdAt: new Date("2026-01-01T00:00:00Z"), questionText: `Q-${id}`, choices: ["a", "b"], answers: [1], explanation: "e", category: "CAT", difficulty: "EASY", factSourceMapping: null }; }
function qa(generatedQuestionId: string, id: string): TestRow { return { id, generatedQuestionId, createdAt: new Date("2026-01-01T00:00:00Z"), isPass: true, hasHallucination: false, isCopyrightSafe: true, criticalFlaws: [], qaFeedback: null, evaluationScores: {} }; }

const PRODUCTION_REVIEW_DIR = path.resolve("data/cbt/evidence/gate3-human-review/gate3-92297f9647f4eebe");
const PRODUCTION_CLOSEOUT_DIR = path.resolve("data/cbt/evidence/gate2-closeout");
type JsonObject = Record<string, unknown>;
type ProductionReviewEntry = {
  generatedQuestionId: string;
  candidateId: string;
  question: string | null;
  options: unknown;
  answers: unknown;
  explanation: string | null;
  category: string | null;
  difficulty: string | null;
  factSourceMapping: unknown;
  latestQaId: string;
  qa: JsonObject;
};

function passingFixture() {
  const rows = FROZEN_GATE_TARGET_IDS.map((id, i) => gq(id, `g${i}`));
  const qas = rows.map((row) => qa(row.id, `qa-${row.id}`));
  for (const row of rows.slice(0, 11)) row.status = "FAILED";
  return { rows, qas, current: closeout(rows.map((row) => ({ ...row })), qas.map((row) => ({ ...row }))) };
}

async function copyProductionReview(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gate3-review-test-"));
  const dir = path.join(root, path.basename(PRODUCTION_REVIEW_DIR));
  await cp(PRODUCTION_REVIEW_DIR, dir, { recursive: true });
  return { dir, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, canonicalJsonString(value) + "\n", "utf8");
}

async function writeManifestWithFreshSidecar(dir: string, mutate: (manifest: JsonObject) => void, manifestFile = "gate3-manifest.json", sidecarFile = "gate3-manifest.sha256"): Promise<void> {
  const manifestPath = path.join(dir, manifestFile);
  const manifest = await readJson(manifestPath);
  mutate(manifest);
  const raw = canonicalJsonString(manifest) + "\n";
  await writeFile(manifestPath, raw, "utf8");
  await writeFile(path.join(dir, sidecarFile), hashFileContent(raw) + "\n", "utf8");
}

async function copyProductionCloseout(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gate3-closeout-test-"));
  const dir = path.join(root, path.basename(PRODUCTION_CLOSEOUT_DIR));
  await cp(PRODUCTION_CLOSEOUT_DIR, dir, { recursive: true });
  return { dir, cleanup: () => rm(root, { recursive: true, force: true }) };
}

describe("Gate3 Phase 3A exact freeze", () => {
  it("derives exactly the QA_PASSED entries in frozen Gate50 order", () => {
    const { rows, qas, current } = passingFixture();
    const entries = deriveGate3Entries(current, rows, qas);
    expect(entries).toHaveLength(39);
    expect(entries[0].candidateId).toBe(FROZEN_GATE_TARGET_IDS[11]);
    expect(entries.every((entry) => entry.disposition === "UNREVIEWED")).toBe(true);
  });

  it("fails closed on a live GQ drift", () => {
    const { rows, qas, current } = passingFixture();
    const live = rows.map((row) => ({ ...row }));
    live[11] = { ...live[11], questionText: "mutated" };
    expect(() => deriveGate3Entries(current, live, qas)).toThrow(/content drift/);
  });

  it.each([
    ["duplicate target", (rows: TestRow[], current: CloseoutCurrent) => { rows[12].candidateQuestionId = rows[11].candidateQuestionId; (current.scopedRows.generatedQuestions[12] as TestRow).candidateQuestionId = (current.scopedRows.generatedQuestions[11] as TestRow).candidateQuestionId; }],
    ["Gate50-outside candidate", (rows: TestRow[], current: CloseoutCurrent) => { rows[11].candidateQuestionId = "outside-gate50"; (current.scopedRows.generatedQuestions[11] as TestRow).candidateQuestionId = "outside-gate50"; }],
    ["source non-QA_PASSED entry", (rows: TestRow[], current: CloseoutCurrent) => { rows[11].status = "FAILED"; (current.scopedRows.generatedQuestions[11] as TestRow).status = "FAILED"; }],
  ])("fails closed on %s", (_name, mutate) => {
    const { rows, qas, current } = passingFixture();
    mutate(rows, current);
    expect(() => deriveGate3Entries(current, rows, qas)).toThrow();
  });

  it.each([
    ["GQ ID drift", (_rows: TestRow[], _qas: TestRow[], live: TestRow[]) => { live[11].id = "gq-drift"; }, /live GQ drift/],
    ["latest QA ID drift", (_rows: TestRow[], qas: TestRow[]) => { qas[11].id = "qa-drift"; }, /latest QA drift/],
    ["question mutation", (_rows: TestRow[], _qas: TestRow[], live: TestRow[]) => { live[11].questionText = "mutated"; }, /content drift/],
    ["options mutation", (_rows: TestRow[], _qas: TestRow[], live: TestRow[]) => { live[11].choices = ["mutated"]; }, /content drift/],
    ["correctAnswer mutation", (_rows: TestRow[], _qas: TestRow[], live: TestRow[]) => { live[11].answers = [99]; }, /content drift/],
    ["explanation mutation", (_rows: TestRow[], _qas: TestRow[], live: TestRow[]) => { live[11].explanation = "mutated"; }, /content drift/],
  ])("fails closed on %s", (_name, mutate, expected) => {
    const { rows, qas, current } = passingFixture();
    const live = rows.map((row) => ({ ...row }));
    mutate(rows, qas, live);
    expect(() => deriveGate3Entries(current, live, qas)).toThrow(expected);
  });

  it("fails closed on wrong source count", () => {
    const { rows, qas, current } = passingFixture();
    (current.scopedRows.generatedQuestions[11] as TestRow).status = "FAILED";
    expect(() => deriveGate3Entries(current, rows, qas)).toThrow(/count mismatch/);
  });

  it.each([
    ["invalid Gate2 closeout decision", (manifest: JsonObject) => { manifest.decision = "GATE2_OPERATIONAL_CLOSEOUT_FAIL"; }],
    ["baseSystemDecision != FAIL", (manifest: JsonObject) => { manifest.baseSystemDecision = "PASS"; }],
  ])("fails closed on %s", async (_name, mutate) => {
    const { dir, cleanup } = await copyProductionCloseout();
    try {
      await writeManifestWithFreshSidecar(dir, mutate, "closeout-manifest.json", "closeout-manifest.sha256");
      await expect(loadGate3Source(path.join(dir, "closeout-current.json"), path.join(dir, "closeout-manifest.json"))).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it("verifier rejects a missing artifact directory", async () => {
    const result = await verifyGate3ReviewArtifacts("data/cbt/evidence/gate3-human-review/missing-test");
    expect(result.valid).toBe(false);
  });

  it.each([
    ["frozen count mismatch", async (dir: string) => { const frozen = await readJson(path.join(dir, "gate3-frozen.json")); (frozen.entries as JsonObject[]).pop(); await writeJson(path.join(dir, "gate3-frozen.json"), frozen); }],
    ["frozen hash mismatch", async (dir: string) => { const frozen = await readJson(path.join(dir, "gate3-frozen.json")); frozen.gate3TargetSetHash = "0".repeat(64); await writeJson(path.join(dir, "gate3-frozen.json"), frozen); }],
    ["raw gate3-frozen.json tamper", async (dir: string) => { const frozen = await readJson(path.join(dir, "gate3-frozen.json")); ((frozen.entries as JsonObject[])[0]).generatedQuestionId = "tampered"; await writeJson(path.join(dir, "gate3-frozen.json"), frozen); }],
    ["raw gate3-review.json tamper", async (dir: string) => { const review = await readJson(path.join(dir, "gate3-review.json")); (review.entries as JsonObject[])[0].question = "tampered"; await writeJson(path.join(dir, "gate3-review.json"), review); }],
    ["options mutation", async (dir: string) => { const review = await readJson(path.join(dir, "gate3-review.json")); (review.entries as JsonObject[])[0].options = ["tampered"]; await writeJson(path.join(dir, "gate3-review.json"), review); }],
    ["correctAnswer mutation", async (dir: string) => { const review = await readJson(path.join(dir, "gate3-review.json")); (review.entries as JsonObject[])[0].answers = [99]; await writeJson(path.join(dir, "gate3-review.json"), review); }],
    ["explanation mutation", async (dir: string) => { const review = await readJson(path.join(dir, "gate3-review.json")); (review.entries as JsonObject[])[0].explanation = "tampered"; await writeJson(path.join(dir, "gate3-review.json"), review); }],
  ])("verifier rejects %s", async (_name, mutate) => {
    const { dir, cleanup } = await copyProductionReview();
    try {
      await mutate(dir);
      expect((await verifyGate3ReviewArtifacts(dir)).valid).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it.each([
    ["gate3TargetSetHash tamper", (manifest: JsonObject) => { manifest.gate3TargetSetHash = "0".repeat(64); }],
    ["gate3ReviewSnapshotHash tamper", (manifest: JsonObject) => { manifest.gate3ReviewSnapshotHash = "0".repeat(64); }],
    ["manifest tamper", (manifest: JsonObject) => { manifest.entryCount = 38; }],
  ])("verifier rejects %s", async (_name, mutate) => {
    const { dir, cleanup } = await copyProductionReview();
    try {
      await writeManifestWithFreshSidecar(dir, mutate);
      expect((await verifyGate3ReviewArtifacts(dir)).valid).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("verifier rejects sidecar tamper", async () => {
    const { dir, cleanup } = await copyProductionReview();
    try {
      await writeFile(path.join(dir, "gate3-manifest.sha256"), "0".repeat(64) + "\n", "utf8");
      expect((await verifyGate3ReviewArtifacts(dir)).valid).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("rejects an existing artifact directory/file instead of overwriting it", async () => {
    const productionReview = JSON.parse(await readFile(path.join(PRODUCTION_REVIEW_DIR, "gate3-review.json"), "utf8")) as { entries: ProductionReviewEntry[] };
    const db = {
      generatedQuestion: { findMany: async () => productionReview.entries.map((entry) => ({ id: entry.generatedQuestionId, candidateQuestionId: entry.candidateId, status: "QA_PASSED", createdAt: new Date(), questionText: entry.question, choices: entry.options, answers: entry.answers, explanation: entry.explanation, category: entry.category, difficulty: entry.difficulty, factSourceMapping: entry.factSourceMapping })) },
      generatedQuestionQA: { findMany: async () => productionReview.entries.map((entry) => ({ id: entry.latestQaId, generatedQuestionId: entry.generatedQuestionId, createdAt: new Date(), ...entry.qa })) },
    };
    const parent = await mkdtemp(path.join(os.tmpdir(), "gate3-overwrite-test-"));
    try {
      await buildGate3ReviewArtifacts({ db, outputBaseDir: parent });
      await expect(buildGate3ReviewArtifacts({ db, outputBaseDir: parent })).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
