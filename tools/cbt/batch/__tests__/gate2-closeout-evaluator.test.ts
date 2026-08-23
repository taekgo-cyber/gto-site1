import { describe, it, expect } from "vitest";
import {
  evaluateGate2OperationalCloseout,
  type Gate2CloseoutRelevantRun,
} from "../gate2-closeout-evaluator";
import {
  GATE2_OPERATIONAL_CLOSEOUT_PASS,
  GATE2_OPERATIONAL_CLOSEOUT_FAIL,
  GATE2_BASE_SYSTEM_DECISION,
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES,
  GATE2_CLOSEOUT_TOTAL,
  GATE2_CLOSEOUT_QA_PASSED_COUNT,
  GATE2_CLOSEOUT_QA_FAILED_COUNT,
  GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT,
} from "../gate2-closeout-policy";
import { FROZEN_GATE_TARGET_IDS } from "../gate2-frozen-gate";
import type { Gate2GeneratedQuestion } from "../gate2-state";
import { scopeRowsByCandidateSet } from "../gate2-closeout-evidence";

function buildExactCloseoutState(
  overrides?: (latest: Map<string, Gate2GeneratedQuestion>) => void,
): Map<string, Gate2GeneratedQuestion> {
  const targetIds = [...FROZEN_GATE_TARGET_IDS];
  const excludedMap = new Map(
    GATE2_CLOSEOUT_EXCLUDED_ENTRIES.map((e) => [e.candidateId, e]),
  );
  const nonExcluded = targetIds.filter((cid) => !excludedMap.has(cid));
  expect(nonExcluded.length).toBe(45);

  const latest = new Map<string, Gate2GeneratedQuestion>();
  let i = 0;
  for (const cid of nonExcluded) {
    const status = i < GATE2_CLOSEOUT_QA_PASSED_COUNT ? "QA_PASSED" : "QA_FAILED";
    latest.set(cid, {
      id: `gq-${cid}`,
      candidateQuestionId: cid,
      status: status as Gate2GeneratedQuestion["status"],
      errorCode: null,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    });
    i += 1;
  }
  for (const entry of GATE2_CLOSEOUT_EXCLUDED_ENTRIES) {
    latest.set(entry.candidateId, {
      id: entry.generatedQuestionId,
      candidateQuestionId: entry.candidateId,
      status: "FAILED" as Gate2GeneratedQuestion["status"],
      errorCode: entry.errorCode,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    });
  }
  if (overrides) overrides(latest);
  return latest;
}

function defaultScopedRows(latest: Map<string, Gate2GeneratedQuestion>) {
  const gqs = [...latest.values()];
  return scopeRowsByCandidateSet(gqs, [], [...FROZEN_GATE_TARGET_IDS]);
}

function defaultRelevantRuns(): Gate2CloseoutRelevantRun[] {
  return [{ runId: "gate2-closeout-final", complete: true, aborted: false, circuitOpenCount: 0 }];
}

describe("gate2-closeout-evaluator exact frozen state", () => {
  it("passes operational closeout for the exact approved frozen state", () => {
    const latest = buildExactCloseoutState();
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      targetIds: [...FROZEN_GATE_TARGET_IDS],
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      relevantRuns: defaultRelevantRuns(),
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_PASS);
    expect(result.baseSystemDecision).toBe(GATE2_BASE_SYSTEM_DECISION);
    expect(result.total).toBe(GATE2_CLOSEOUT_TOTAL);
    expect(result.qaPassed).toBe(GATE2_CLOSEOUT_QA_PASSED_COUNT);
    expect(result.qaFailed).toBe(GATE2_CLOSEOUT_QA_FAILED_COUNT);
    expect(result.transientFailed).toBe(GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT);
    expect(result.terminalFailed).toBe(0);
    expect(result.incomplete).toBe(0);
    expect(result.excludedMatch).toBe(true);
    expect(result.excludedReasonsAllowed).toBe(true);
    expect(result.appendOnlyPassed).toBe(true);
    expect(result.auditPassed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("always reports baseSystemDecision = FAIL", () => {
    const latest = buildExactCloseoutState();
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.baseSystemDecision).toBe("FAIL");
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_PASS);
  });
});

describe("gate2-closeout-evaluator failure modes", () => {
  it("fails if an excluded candidate status later changes", () => {
    const latest = buildExactCloseoutState((map) => {
      const entry = GATE2_CLOSEOUT_EXCLUDED_ENTRIES[0];
      map.set(entry.candidateId, {
        id: "recovered-gq-id",
        candidateQuestionId: entry.candidateId,
        status: "QA_PASSED",
        errorCode: null,
        createdAt: new Date("2026-08-23T00:00:00.000Z"),
      });
    });
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("excluded_mismatch"))).toBe(true);
  });

  it("fails if an excluded error code is not allowed", () => {
    const latest = buildExactCloseoutState((map) => {
      const entry = GATE2_CLOSEOUT_EXCLUDED_ENTRIES[0];
      map.set(entry.candidateId, {
        id: entry.generatedQuestionId,
        candidateQuestionId: entry.candidateId,
        status: "FAILED",
        errorCode: "provider_error",
        createdAt: new Date("2026-08-22T00:00:00.000Z"),
      });
    });
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("excluded_disallowed_reason"))).toBe(true);
  });

  it("fails if counts deviate from the frozen scope", () => {
    const latest = buildExactCloseoutState((map) => {
      // Turn one QA_FAILED into a transient failure -> transient count becomes 6.
      const nonExcluded = [...FROZEN_GATE_TARGET_IDS].filter(
        (cid) => !GATE2_CLOSEOUT_EXCLUDED_ENTRIES.some((e) => e.candidateId === cid),
      );
      const changed = nonExcluded[GATE2_CLOSEOUT_QA_PASSED_COUNT + 1];
      map.set(changed, {
        id: `gq-${changed}-failed`,
        candidateQuestionId: changed,
        status: "FAILED",
        errorCode: "timeout",
        createdAt: new Date("2026-08-22T00:00:00.000Z"),
      });
    });
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("transient_failed"))).toBe(true);
    expect(result.reasons.some((r) => r.startsWith("qa_failed"))).toBe(true);
  });

  it("fails if dataset audit is not clean", () => {
    const latest = buildExactCloseoutState();
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      datasetAuditPassed: false,
      auditErrors: 1,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("audit_not_clean"))).toBe(true);
  });

  it("fails if relevant run is aborted", () => {
    const latest = buildExactCloseoutState();
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      relevantRuns: [{ runId: "aborted-recovery", complete: false, aborted: true, circuitOpenCount: 0 }],
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.includes("aborted_or_incomplete"))).toBe(true);
  });

  it("fails if circuit_open is present", () => {
    const latest = buildExactCloseoutState();
    const scoped = defaultScopedRows(latest);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: scoped,
      currentScopedRows: scoped,
      relevantRuns: [{ runId: "r", complete: true, aborted: false, circuitOpenCount: 1 }],
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("circuit_open"))).toBe(true);
  });

  it("fails if scoped rows are mutated", () => {
    const latest = buildExactCloseoutState();
    const baseline = defaultScopedRows(latest);
    const current = scopeRowsByCandidateSet(
      [...latest.values()].map((r) =>
        r.id === "gq-cmssx4qye001qjsroptfyzx32"
          ? { ...r, status: "QA_FAILED" }
          : r,
      ),
      [],
      [...FROZEN_GATE_TARGET_IDS],
    );
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: baseline,
      currentScopedRows: current,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("scoped_append_only_failed"))).toBe(true);
  });

  it("fails if scoped rows are deleted", () => {
    const latest = buildExactCloseoutState();
    const baseline = defaultScopedRows(latest);
    const current = scopeRowsByCandidateSet(
      [...latest.values()].filter((r) => r.candidateQuestionId !== FROZEN_GATE_TARGET_IDS[0]),
      [],
      [...FROZEN_GATE_TARGET_IDS],
    );
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: baseline,
      currentScopedRows: current,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_FAIL);
    expect(result.reasons.some((r) => r.startsWith("scoped_append_only_failed"))).toBe(true);
  });

  it("passes scoped new append within the 50", () => {
    const latest = buildExactCloseoutState();
    const baseline = defaultScopedRows(latest);
    const appended = {
      id: "new-gq-append",
      candidateQuestionId: FROZEN_GATE_TARGET_IDS[0],
      status: "QA_PASSED",
      errorCode: null,
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
    } as Gate2GeneratedQuestion;
    const current = scopeRowsByCandidateSet([...latest.values(), appended], [], [
      ...FROZEN_GATE_TARGET_IDS,
    ]);
    // Latest map remains unchanged so counts still match.
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: baseline,
      currentScopedRows: current,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.appendOnlyPassed).toBe(true);
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_PASS);
  });

  it("ignores unrelated candidate append", () => {
    const latest = buildExactCloseoutState();
    const baseline = defaultScopedRows(latest);
    const outside = {
      id: "outside-gq",
      candidateQuestionId: "outside-candidate-id",
      status: "QA_PASSED",
      errorCode: null,
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
    } as Gate2GeneratedQuestion;
    const current = scopeRowsByCandidateSet([...latest.values(), outside], [], [
      ...FROZEN_GATE_TARGET_IDS,
    ]);
    const result = evaluateGate2OperationalCloseout({
      latestByCandidate: latest,
      baselineScopedRows: baseline,
      currentScopedRows: current,
      datasetAuditPassed: true,
      auditErrors: 0,
      auditWarnings: 0,
    });
    expect(result.appendOnlyPassed).toBe(true);
    expect(result.decision).toBe(GATE2_OPERATIONAL_CLOSEOUT_PASS);
  });
});
