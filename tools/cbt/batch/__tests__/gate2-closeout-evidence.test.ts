import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  scopeRowsByCandidateSet,
  verifyScopedAppendOnly,
  computeCloseoutBaselineIdentity,
  buildCloseoutBaseline,
  buildCloseoutCurrent,
  buildCloseoutManifest,
  writeCloseoutArtifacts,
  readGate2CloseoutManifest,
  type CloseoutScopedRows,
} from "../gate2-closeout-evidence";
import { FROZEN_GATE_TARGET_IDS } from "../gate2-frozen-gate";
import { selectLatestGeneratedQuestions, type Gate2GeneratedQuestion } from "../gate2-state";

describe("gate2-closeout-evidence scoped append-only", () => {
  const targetIds = FROZEN_GATE_TARGET_IDS.slice(0, 4);

  function makeGq(id: string, candidateId: string, status = "QA_PASSED"): CloseoutScopedRows["generatedQuestions"][number] {
    return {
      id,
      candidateQuestionId: candidateId,
      status,
      errorCode: null,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
      updatedAt: new Date("2026-08-22T00:00:00.000Z"),
    };
  }

  function makeQa(id: string, gqId: string): CloseoutScopedRows["generatedQuestionQAs"][number] {
    return {
      id,
      generatedQuestionId: gqId,
      isPass: true,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    };
  }

  it("scopes rows to the target candidate set", () => {
    const gqs = [
      makeGq("g1", targetIds[0]),
      makeGq("g2", targetIds[1]),
      makeGq("g3", "outside-candidate"),
    ];
    const qas = [makeQa("qa1", "g1"), makeQa("qa2", "g3"), makeQa("qa3", "unrelated-gq")];
    const scoped = scopeRowsByCandidateSet(gqs, qas, targetIds);
    expect(scoped.generatedQuestions.map((r) => r.id)).toEqual(["g1", "g2"]);
    expect(scoped.generatedQuestionQAs.map((r) => r.id)).toEqual(["qa1"]);
  });

  it("passes append-only when baseline and current are identical", () => {
    const gqs = [makeGq("g1", targetIds[0])];
    const qas = [makeQa("qa1", "g1")];
    const baseline: CloseoutScopedRows = { generatedQuestions: gqs, generatedQuestionQAs: qas };
    const check = verifyScopedAppendOnly(baseline, baseline);
    expect(check.appendOnlyPassed).toBe(true);
    expect(check.deletedCount).toBe(0);
    expect(check.mutatedCount).toBe(0);
    expect(check.appendedCount).toBe(0);
  });

  it("scoped new append passes", () => {
    const baseline: CloseoutScopedRows = {
      generatedQuestions: [makeGq("g1", targetIds[0])],
      generatedQuestionQAs: [makeQa("qa1", "g1")],
    };
    const current: CloseoutScopedRows = {
      generatedQuestions: [makeGq("g1", targetIds[0]), makeGq("g2", targetIds[0])],
      generatedQuestionQAs: [makeQa("qa1", "g1"), makeQa("qa2", "g2")],
    };
    const check = verifyScopedAppendOnly(baseline, current);
    expect(check.appendOnlyPassed).toBe(true);
    expect(check.appendedCount).toBe(2);
    expect(check.deletedCount).toBe(0);
    expect(check.mutatedCount).toBe(0);
  });

  it("scoped deletion fails", () => {
    const baseline: CloseoutScopedRows = {
      generatedQuestions: [makeGq("g1", targetIds[0]), makeGq("g2", targetIds[0])],
      generatedQuestionQAs: [makeQa("qa1", "g1"), makeQa("qa2", "g2")],
    };
    const current: CloseoutScopedRows = {
      generatedQuestions: [makeGq("g1", targetIds[0])],
      generatedQuestionQAs: [makeQa("qa1", "g1")],
    };
    const check = verifyScopedAppendOnly(baseline, current);
    expect(check.appendOnlyPassed).toBe(false);
    expect(check.deletedCount).toBe(2);
    expect(check.mutatedCount).toBe(0);
  });

  it("scoped mutation fails", () => {
    const baseline: CloseoutScopedRows = {
      generatedQuestions: [makeGq("g1", targetIds[0])],
      generatedQuestionQAs: [makeQa("qa1", "g1")],
    };
    const current: CloseoutScopedRows = {
      generatedQuestions: [{ ...makeGq("g1", targetIds[0]), status: "QA_FAILED" }],
      generatedQuestionQAs: [makeQa("qa1", "g1")],
    };
    const check = verifyScopedAppendOnly(baseline, current);
    expect(check.appendOnlyPassed).toBe(false);
    expect(check.deletedCount).toBe(0);
    expect(check.mutatedCount).toBe(1);
  });

  it("unrelated candidate append is ignored", () => {
    const baseline: CloseoutScopedRows = scopeRowsByCandidateSet(
      [makeGq("g1", targetIds[0])],
      [makeQa("qa1", "g1")],
      targetIds,
    );
    const current: CloseoutScopedRows = scopeRowsByCandidateSet(
      [makeGq("g1", targetIds[0]), makeGq("g2", "outside-candidate")],
      [makeQa("qa1", "g1"), makeQa("qa2", "g2")],
      targetIds,
    );
    const check = verifyScopedAppendOnly(baseline, current);
    expect(check.appendOnlyPassed).toBe(true);
    expect(check.appendedCount).toBe(0);
  });

  it("computes baseline identity for the frozen target set", () => {
    const rows: Gate2GeneratedQuestion[] = targetIds.map((cid, i) => ({
      id: `g-${i}`,
      candidateQuestionId: cid,
      status: "QA_PASSED",
      errorCode: null,
      createdAt: new Date(`2026-08-22T00:00:0${i}.000Z`),
    }));
    const latest = selectLatestGeneratedQuestions(rows);
    const { identity, entries } = computeCloseoutBaselineIdentity(targetIds, latest);
    expect(identity).toBeTruthy();
    expect(entries).toHaveLength(targetIds.length);
    expect(entries[0].candidateQuestionId).toBe(targetIds.sort()[0]);
  });
});

describe("gate2-closeout-evidence artifacts", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "cbt-closeout-artifacts-"));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads closeout artifacts with wx exclusivity", async () => {
    const targetIds = FROZEN_GATE_TARGET_IDS.slice(0, 2);
    const rows: Gate2GeneratedQuestion[] = targetIds.map((cid, i) => ({
      id: `g-${i}`,
      candidateQuestionId: cid,
      status: "QA_PASSED",
      errorCode: null,
      createdAt: new Date(`2026-08-22T00:00:0${i}.000Z`),
    }));
    const latest = selectLatestGeneratedQuestions(rows);
    const scoped = scopeRowsByCandidateSet(rows, [], targetIds);
    const baseline = buildCloseoutBaseline(targetIds, latest, scoped);
    const current = buildCloseoutCurrent(targetIds, scoped);
    const manifest = buildCloseoutManifest({
      decision: "GATE2_OPERATIONAL_CLOSEOUT_PASS",
      targetCount: targetIds.length,
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

    await writeCloseoutArtifacts(tmpDir, baseline, current, manifest);

    const read = await readGate2CloseoutManifest(
      path.join(tmpDir, "closeout-manifest.json"),
    );
    expect(read.decision).toBe("GATE2_OPERATIONAL_CLOSEOUT_PASS");
    expect(read.targetCount).toBe(targetIds.length);
    expect(read.gateTargetHash).toBe(baseline.gateTargetHash);
  });
});
