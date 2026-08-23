import { describe, expect, it } from "vitest";
import { evaluateGate2Final } from "../gate2-final-evaluator";
import { hashTargetIds } from "../gate2-state";
describe("Gate 2 exact final evaluator", () => {
  it("latest final states와 모든 system checks를 만족해야 PASS한다", () => {
    const latest = new Map([["a", { id: "g", candidateQuestionId: "a", status: "QA_PASSED" as const, errorCode: null, createdAt: new Date() }]]);
    expect(evaluateGate2Final({ targetIds: ["a"], latestByCandidate: latest, relevantRuns: [{ runId: "r", complete: true, aborted: false, circuitOpenCount: 0 }], datasetAuditPassed: true, integrityEvidence: { gateTargetHash: hashTargetIds(["a"]), relevantRunIds: ["r"], baselineIdentity: "head", preSnapshotIdentity: "pre", postSnapshotIdentity: "post", appendOnlyPassed: true, historicalMutationCount: 0, targetExternalChangeCount: 0 } }).decision).toBe("PASS");
  });
  it("terminal, incomplete, integrity 미확인은 FAIL 사유로 보존한다", () => {
    const result = evaluateGate2Final({ targetIds: ["a", "missing"], latestByCandidate: new Map([["a", { id: "g", candidateQuestionId: "a", status: "FAILED" as const, errorCode: "schema_validation_failed", createdAt: new Date() }]]), relevantRuns: [], datasetAuditPassed: true });
    expect(result.decision).toBe("FAIL"); expect(result.reasons).toContain("terminal_failed=1"); expect(result.reasons).toContain("incomplete=1");
  });
});
