import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateGate2Final } from "./batch/gate2-final-evaluator";
import { createPreEvidence, finalizeEvidence, verifyEvidenceAtPath } from "./batch/gate2-integrity-evidence";
import { getGate2RecoveryPolicy } from "./batch/gate2-recovery-policy";
import { FROZEN_GATE_TARGET_IDS, FROZEN_GATE_TARGET_HASH } from "./batch/gate2-frozen-gate";

function makeGq(id: string, candidateId: string) {
  return {
    id,
    candidateQuestionId: candidateId,
    status: "QA_PASSED" as const,
    errorCode: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    questionText: `q-${id}`,
    choices: [{ index: 1, text: "a" }],
    answers: [1],
  };
}

describe("cli-gate2-evaluate evidence binding", () => {
  let tmpEvidence: string;
  let tmpRunlog: string;
  beforeEach(async () => {
    tmpEvidence = await mkdtemp(path.join(os.tmpdir(), "cbt-eval-ev-"));
    tmpRunlog = await mkdtemp(path.join(os.tmpdir(), "cbt-eval-runs-"));
  });
  afterEach(async () => {
    await rm(tmpEvidence, { recursive: true, force: true });
    await rm(tmpRunlog, { recursive: true, force: true });
  });

  it("without evidence preserve fail-closed", () => {
    const targetIds = [...FROZEN_GATE_TARGET_IDS];
    const latest = new Map([[targetIds[0], { id: "g", candidateQuestionId: targetIds[0], status: "QA_PASSED" as const, errorCode: null, createdAt: new Date() }]]);
    const res = evaluateGate2Final({ targetIds, latestByCandidate: latest, relevantRuns: [{ runId: "r", complete: true, aborted: false, circuitOpenCount: 0 }], datasetAuditPassed: true });
    expect(res.decision).toBe("FAIL");
    expect(res.reasons.join(" ")).toContain("append-only integrity evidence");
  });

  it("with valid evidence verify hashes/runlog and PASS", async () => {
    const policy = getGate2RecoveryPolicy("contract");
    const targetIds = [...FROZEN_GATE_TARGET_IDS];
    const gqs = targetIds.map((cid, i) => makeGq(`g${i}`, cid));
    const db = { generatedQuestion: { findMany: async () => [...gqs] }, generatedQuestionQA: { findMany: async () => [] } };
    const evidenceId = "eval-valid";
    await createPreEvidence({ evidenceId, targetIds, evidenceBaseDir: tmpEvidence, db, lane: policy.lane, policyVersion: policy.policyVersion, parentRunId: policy.parentRunId, targetSetHash: policy.targetSetHash });
    const runId = "run-eval-valid";
    // run targets are lane policy, not gate 50 (separate identities)
    const runTargets = policy.targets.map((t) => t.candidateId);
    const runStart = {
      type: "run_start",
      runId,
      command: "gate2-recovery",
      args: ["--lane=contract"],
      targets: runTargets,
      total: runTargets.length,
      concurrency: 1,
      runType: "gate2_post_failure_recovery",
      policyVersion: policy.policyVersion,
      lane: policy.lane,
      parentRunId: policy.parentRunId,
      targetSetHash: policy.targetSetHash,
      createdAt: new Date().toISOString(),
    };
    const runEnd = { type: "run_end", runId, succeeded: 1, failed: 0, durationMs: 10, endedAt: new Date().toISOString() };
    await writeFile(path.join(tmpRunlog, `${runId}.jsonl`), JSON.stringify(runStart) + "\n" + JSON.stringify(runEnd) + "\n", "utf8");
    // for valid append, add new row for finalize
    const postDb = { generatedQuestion: { findMany: async () => [...gqs, makeGq("gNew", targetIds[0])] }, generatedQuestionQA: { findMany: async () => [] } };
    await finalizeEvidence({ evidenceId, runId, evidenceBaseDir: tmpEvidence, runLogDir: tmpRunlog, db: postDb });
    const verified = await verifyEvidenceAtPath(path.join(tmpEvidence, evidenceId, "final-manifest.json"), { runLogDir: tmpRunlog });
    expect(verified.valid).toBe(true);
    expect(verified.evidence).toBeDefined();
    expect(verified.evidence?.gateTargetHash).toBe(FROZEN_GATE_TARGET_HASH);
    const latest = new Map(targetIds.map((cid) => [cid, { id: `g${cid}`, candidateQuestionId: cid, status: "QA_PASSED" as const, errorCode: null, createdAt: new Date() } as const]));
    const res = evaluateGate2Final({ targetIds, latestByCandidate: latest, relevantRuns: [{ runId, complete: true, aborted: false, circuitOpenCount: 0 }], datasetAuditPassed: true, integrityEvidence: verified.evidence });
    expect(res.decision).toBe("PASS");
  });

  it("invalid/tampered evidence never PASS", async () => {
    const policy = getGate2RecoveryPolicy("contract");
    const targetIds = [...FROZEN_GATE_TARGET_IDS];
    const gqs = targetIds.map((cid, i) => makeGq(`g${i}`, cid));
    const db = { generatedQuestion: { findMany: async () => [...gqs] }, generatedQuestionQA: { findMany: async () => [] } };
    const evidenceId = "eval-tamper";
    await createPreEvidence({ evidenceId, targetIds, evidenceBaseDir: tmpEvidence, db, lane: policy.lane, policyVersion: policy.policyVersion, parentRunId: policy.parentRunId, targetSetHash: policy.targetSetHash });
    const runId = "run-tamper-eval";
    const runTargets = policy.targets.map((t) => t.candidateId);
    const runStart = {
      type: "run_start",
      runId,
      command: "gate2-recovery",
      args: ["--lane=contract"],
      targets: runTargets,
      total: runTargets.length,
      concurrency: 1,
      runType: "gate2_post_failure_recovery",
      policyVersion: policy.policyVersion,
      lane: policy.lane,
      parentRunId: policy.parentRunId,
      targetSetHash: policy.targetSetHash,
      createdAt: new Date().toISOString(),
    };
    const runEnd = { type: "run_end", runId, succeeded: 0, failed: 0, durationMs: 10, endedAt: new Date().toISOString() };
    await writeFile(path.join(tmpRunlog, `${runId}.jsonl`), JSON.stringify(runStart) + "\n" + JSON.stringify(runEnd) + "\n", "utf8");
    await finalizeEvidence({ evidenceId, runId, evidenceBaseDir: tmpEvidence, runLogDir: tmpRunlog, db });
    const finalPath = path.join(tmpEvidence, evidenceId, "final-manifest.json");
    // tamper by overwriting snapshot file (simulate)
    await writeFile(path.join(tmpEvidence, evidenceId, "generatedQuestions.json"), JSON.stringify([{ id: "tampered" }]), "utf8");
    const verified = await verifyEvidenceAtPath(finalPath, { runLogDir: tmpRunlog });
    expect(verified.valid).toBe(false);
    const res = evaluateGate2Final({
      targetIds,
      latestByCandidate: new Map([[targetIds[0], { id: "g1", candidateQuestionId: targetIds[0], status: "QA_PASSED" as const, errorCode: null, createdAt: new Date() }]]),
      relevantRuns: [{ runId, complete: true, aborted: false, circuitOpenCount: 0 }],
      datasetAuditPassed: true,
      integrityEvidence: verified.evidence,
    });
    expect(res.decision).toBe("FAIL");
  });

  it("--run-id aborted must fail closed (e765... never PASS)", async () => {
    const targetIds = [...FROZEN_GATE_TARGET_IDS];
    const res = evaluateGate2Final({ targetIds, latestByCandidate: new Map([[targetIds[0], { id: "g", candidateQuestionId: targetIds[0], status: "QA_PASSED" as const, errorCode: null, createdAt: new Date() }]]), relevantRuns: [], datasetAuditPassed: true });
    expect(res.decision).toBe("FAIL");
    const policy = getGate2RecoveryPolicy("provider");
    const db = { generatedQuestion: { findMany: async () => FROZEN_GATE_TARGET_IDS.map((cid) => makeGq(`g-${cid}`, cid)) }, generatedQuestionQA: { findMany: async () => [] } };
    const evidenceId = "eval-aborted";
    await createPreEvidence({ evidenceId, targetIds: [...FROZEN_GATE_TARGET_IDS], evidenceBaseDir: tmpEvidence, db, lane: policy.lane, policyVersion: policy.policyVersion, parentRunId: policy.parentRunId, targetSetHash: policy.targetSetHash });
    const runId = "e765495f-1351-4a9f-bfde-e1730033710f";
    const { readFile } = await import("node:fs/promises");
    const real = await readFile(path.join("data", "cbt", "runs", `${runId}.jsonl`), "utf8").catch(() => null);
    if (real) {
      await writeFile(path.join(tmpRunlog, `${runId}.jsonl`), real, "utf8");
      await expect(finalizeEvidence({ evidenceId, runId, evidenceBaseDir: tmpEvidence, runLogDir: tmpRunlog, db })).rejects.toThrow(/aborted/);
      const finalPath = path.join(tmpEvidence, evidenceId, "final-manifest.json");
      const verified = await verifyEvidenceAtPath(finalPath, { runLogDir: tmpRunlog });
      expect(verified.valid).toBe(false);
    }
  });
});
