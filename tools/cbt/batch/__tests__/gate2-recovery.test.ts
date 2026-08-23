import { describe, expect, it } from "vitest";
import { CONTRACT_RECOVERY_POLICY, PROVIDER_RECOVERY_POLICY } from "../gate2-recovery-policy";
import { hashTargetIds, validateRecoveryPreflight, type Gate2GeneratedQuestion } from "../gate2-state";
import { classifyRecoveryOutcome, runGate2Recovery } from "../gate2-recovery";

function rows(policy = CONTRACT_RECOVERY_POLICY): Gate2GeneratedQuestion[] {
  return policy.targets.map((target, index) => ({ id: target.expectedLatestGeneratedQuestionId, candidateQuestionId: target.candidateId, status: target.expectedStatus, errorCode: target.expectedErrorCode, createdAt: new Date(1000 + index) }));
}
describe("Gate 2 recovery frozen preflight", () => {
  it("canonical hash와 exact latest state가 일치할 때만 통과한다", () => {
    expect(hashTargetIds(CONTRACT_RECOVERY_POLICY.targets.map((t) => t.candidateId))).toBe(CONTRACT_RECOVERY_POLICY.targetSetHash);
    expect(validateRecoveryPreflight(CONTRACT_RECOVERY_POLICY, CONTRACT_RECOVERY_POLICY.targets.map((t) => ({ id: t.candidateId })), rows()).ok).toBe(true);
  });
  it("latest 상태가 달라지면 provider/runlog 전에 fail-closed 한다", async () => {
    const result = await runGate2Recovery("contract", {
      stateStore: { findCandidatesByIds: async (ids) => ids.map((id) => ({ id })), findGeneratedQuestionsByCandidateIds: async () => [{ ...rows()[0], errorCode: "timeout" }] },
      executeCandidate: async () => { throw new Error("must not execute"); }, runLogDir: "unused",
    });
    expect(result.preflight.ok).toBe(false); expect(result.executed).toBe(0); expect(result.runId).toBeUndefined();
  });
  it("transient 분류와 provider two-consecutive kill switch를 적용한다", async () => {
    expect(classifyRecoveryOutcome({ generatedQuestionId: "g", status: "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: false, errorCode: "timeout" })).toBe("TRANSIENT");
    const result = await runGate2Recovery("provider", {
      stateStore: { findCandidatesByIds: async (ids) => ids.map((id) => ({ id })), findGeneratedQuestionsByCandidateIds: async () => rows(PROVIDER_RECOVERY_POLICY) },
      executeCandidate: async () => ({ generatedQuestionId: "new", status: "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: false, errorCode: "timeout" }),
      runLogDir: "unused", createSession: async () => ({ runId: "test", isBroken: () => false, appendItem: async () => true, finish: async () => undefined }),
    });
    expect(result.executed).toBe(2); expect(result.abortReason).toBe("consecutive_transient_limit"); expect(result.transient).toBe(2);
  });
  it("QA_FAILED는 완료로 기록하고 provider transient streak을 reset한다", async () => {
    const seen: string[] = [];
    const outcomes = ["timeout", "QA_FAILED", "timeout", "timeout"] as const;
    const result = await runGate2Recovery("provider", {
      stateStore: { findCandidatesByIds: async (ids) => ids.map((id) => ({ id })), findGeneratedQuestionsByCandidateIds: async () => rows(PROVIDER_RECOVERY_POLICY) },
      executeCandidate: async () => {
        const next = outcomes[seen.length] ?? "timeout"; seen.push(next);
        return { generatedQuestionId: "new", status: next === "QA_FAILED" ? "QA_FAILED" : "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: next === "QA_FAILED", errorCode: next === "QA_FAILED" ? null : next };
      },
      runLogDir: "unused", createSession: async () => ({ runId: "test", isBroken: () => false, appendItem: async () => true, finish: async () => undefined }),
    });
    expect(result.executed).toBe(4); expect(result.qaFailed).toBe(1); expect(result.abortReason).toBe("consecutive_transient_limit");
  });
});
