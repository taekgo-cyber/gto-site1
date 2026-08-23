import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBatchPromote } from "../promote";
import { createFakeBatchContentDb } from "./fakeContentStore";
import { readRunLog } from "../runlog";
import {
  isGate2DerivedPromotionFromCandidateIds,
  requireGate2CloseoutManifestForGate2DerivedPromotion,
} from "../gate2-closeout-promotion-guard";
import { FROZEN_GATE_TARGET_IDS } from "../gate2-frozen-gate";
import {
  buildCloseoutBaseline,
  buildCloseoutCurrent,
  buildCloseoutManifest,
  writeCloseoutArtifacts,
  scopeRowsByCandidateSet,
  type CloseoutScopedRows,
} from "../gate2-closeout-evidence";
import { selectLatestGeneratedQuestions } from "../gate2-state";

describe("gate2-closeout-promotion-guard unit", () => {
  it("returns true only when all candidates are Gate2-derived", () => {
    expect(isGate2DerivedPromotionFromCandidateIds([FROZEN_GATE_TARGET_IDS[0]])).toBe(true);
    expect(
      isGate2DerivedPromotionFromCandidateIds([FROZEN_GATE_TARGET_IDS[0], FROZEN_GATE_TARGET_IDS[1]]),
    ).toBe(true);
    expect(
      isGate2DerivedPromotionFromCandidateIds([FROZEN_GATE_TARGET_IDS[0], "residual-candidate"]),
    ).toBe(false);
    expect(isGate2DerivedPromotionFromCandidateIds(["non-gate2-candidate"])).toBe(false);
    expect(isGate2DerivedPromotionFromCandidateIds([])).toBe(false);
  });

  it("requires a manifest for Gate2-derived promotions", async () => {
    await expect(
      requireGate2CloseoutManifestForGate2DerivedPromotion([FROZEN_GATE_TARGET_IDS[0]], ["gq-1"], {}),
    ).rejects.toThrow(/Gate2-derived promotion blocked/);
  });

  it("does not require a manifest for non-Gate2-derived promotions", async () => {
    await expect(
      requireGate2CloseoutManifestForGate2DerivedPromotion(["non-gate2-candidate"], ["gq-1"], {}),
    ).resolves.toBeUndefined();
  });
});

describe("gate2-closeout-promotion-guard integration with runBatchPromote", () => {
  let runLogDir: string;
  let manifestDir: string;
  beforeAll(async () => {
    runLogDir = await mkdtemp(path.join(os.tmpdir(), "cbt-closeout-promote-runlog-"));
    manifestDir = await mkdtemp(path.join(os.tmpdir(), "cbt-closeout-manifest-"));
    await seedRecoveryRunlogs(runLogDir);
  });
  afterAll(async () => {
    await rm(runLogDir, { recursive: true, force: true });
    await rm(manifestDir, { recursive: true, force: true });
  });

  async function seedRecoveryRunlogs(dir: string) {
    for (const runId of [
      "e765495f-1351-4a9f-bfde-e1730033710f",
      "aa5f41b4-27cd-45fa-bc0c-db7e7c5e2e16",
    ]) {
      const src = path.join("data", "cbt", "runs", `${runId}.jsonl`);
      const dst = path.join(dir, `${runId}.jsonl`);
      await copyFile(src, dst);
    }
  }

  function makeScopedRows(): CloseoutScopedRows {
    const gqs = FROZEN_GATE_TARGET_IDS.map((candidateQuestionId, i) => ({
      id: `gq-${candidateQuestionId}`,
      candidateQuestionId,
      status: "QA_PASSED" as const,
      errorCode: null,
      createdAt: new Date(`2026-08-22T00:00:0${i % 10}.000Z`),
      updatedAt: new Date(`2026-08-22T00:00:0${i % 10}.000Z`),
    }));
    return scopeRowsByCandidateSet(gqs, [], FROZEN_GATE_TARGET_IDS);
  }

  async function writePassManifest(subdir: string) {
    const outDir = path.join(manifestDir, subdir);
    const scopedRows = makeScopedRows();
    const latest = selectLatestGeneratedQuestions(scopedRows.generatedQuestions as unknown as import("../gate2-state").Gate2GeneratedQuestion[]);
    const baseline = buildCloseoutBaseline(FROZEN_GATE_TARGET_IDS, latest, scopedRows);
    const current = buildCloseoutCurrent(FROZEN_GATE_TARGET_IDS, scopedRows);
    const manifest = buildCloseoutManifest({
      decision: "GATE2_OPERATIONAL_CLOSEOUT_PASS",
      baselineIdentity: baseline.baselineIdentity,
      currentScopedIdentity: current.scopedIdentity,
      appendOnlyPassed: true,
      scopedDeletedCount: 0,
      scopedMutatedCount: 0,
      scopedAppendedCount: 0,
      auditErrors: 0,
      auditWarnings: 0,
      circuitOpenCount: 0,
      promoteEligibility: false,
      reasons: [],
    });
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    await writeCloseoutArtifacts(outDir, baseline, current, manifest);
    return path.join(outDir, "closeout-manifest.json");
  }

  async function writeFailManifest(subdir: string) {
    const outDir = path.join(manifestDir, subdir);
    const scopedRows = makeScopedRows();
    const latest = selectLatestGeneratedQuestions(scopedRows.generatedQuestions as unknown as import("../gate2-state").Gate2GeneratedQuestion[]);
    const baseline = buildCloseoutBaseline(FROZEN_GATE_TARGET_IDS, latest, scopedRows);
    const current = buildCloseoutCurrent(FROZEN_GATE_TARGET_IDS, scopedRows);
    const manifest = buildCloseoutManifest({
      decision: "GATE2_OPERATIONAL_CLOSEOUT_FAIL",
      baselineIdentity: baseline.baselineIdentity,
      currentScopedIdentity: current.scopedIdentity,
      appendOnlyPassed: true,
      scopedDeletedCount: 0,
      scopedMutatedCount: 0,
      scopedAppendedCount: 0,
      auditErrors: 0,
      auditWarnings: 0,
      circuitOpenCount: 0,
      promoteEligibility: false,
      reasons: ["test failure"],
    });
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    await writeCloseoutArtifacts(outDir, baseline, current, manifest);
    return path.join(outDir, "closeout-manifest.json");
  }

  it("blocks Gate2-derived promotion without a closeout manifest", async () => {
    const fake = createFakeBatchContentDb();
    const gate2CandidateId = FROZEN_GATE_TARGET_IDS[0];
    fake.helpers.seedCandidate({ id: gate2CandidateId });
    fake.helpers.seedGenerated({ id: "g1", candidateQuestionId: gate2CandidateId, status: "APPROVED" });

    await expect(
      runBatchPromote(
        { ids: ["g1"], limit: 10 },
        { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
      ),
    ).rejects.toThrow(/Gate2-derived promotion blocked/);

    // No DB write occurred.
    expect(fake.store.masterQuestions).toHaveLength(0);
  });

  it("allows Gate2-derived promotion with a PASS closeout manifest", async () => {
    const fake = createFakeBatchContentDb();
    const gate2CandidateId = FROZEN_GATE_TARGET_IDS[1];
    fake.helpers.seedCandidate({ id: gate2CandidateId });
    fake.helpers.seedGenerated({ id: "g2", candidateQuestionId: gate2CandidateId, status: "APPROVED" });
    const manifestPath = await writePassManifest("pass-manifest.json");

    const summary = await runBatchPromote(
      { ids: ["g2"], limit: 10 },
      {
        contentDb: fake.contentDb,
        batchDb: fake.batchContentDb,
        runLogDir,
        gate2CloseoutManifestPath: manifestPath,
      },
    );

    expect(summary.succeeded).toBe(1);
    expect(fake.store.masterQuestions).toHaveLength(1);
    const log = await readRunLog(runLogDir, summary.runId!);
    expect(log.runEnd?.aborted).toBeFalsy();
  });

  it("blocks Gate2-derived promotion with a FAIL closeout manifest", async () => {
    const fake = createFakeBatchContentDb();
    const gate2CandidateId = FROZEN_GATE_TARGET_IDS[2];
    fake.helpers.seedCandidate({ id: gate2CandidateId });
    fake.helpers.seedGenerated({ id: "g3", candidateQuestionId: gate2CandidateId, status: "APPROVED" });
    const manifestPath = await writeFailManifest("fail-manifest.json");

    await expect(
      runBatchPromote(
        { ids: ["g3"], limit: 10 },
        {
          contentDb: fake.contentDb,
          batchDb: fake.batchContentDb,
          runLogDir,
          gate2CloseoutManifestPath: manifestPath,
        },
      ),
    ).rejects.toThrow(/closeout decision is GATE2_OPERATIONAL_CLOSEOUT_FAIL/);

    expect(fake.store.masterQuestions).toHaveLength(0);
  });

  it("preserves global APPROVED-only promotion for non-Gate2 candidates without a manifest", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });

    const summary = await runBatchPromote(
      { ids: ["g1"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.succeeded).toBe(1);
    expect(fake.store.masterQuestions).toHaveLength(1);
  });
});
