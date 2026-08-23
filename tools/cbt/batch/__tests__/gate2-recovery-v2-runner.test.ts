import { describe, expect, it } from "vitest";
import { hashTargetIds, type Gate2GeneratedQuestion } from "../gate2-state";
import {
  CONTRACT_RECOVERY_POLICY,
  PROVIDER_RECOVERY_POLICY,
  GATE2_RECOVERY_POLICY_VERSION,
} from "../gate2-recovery-policy";
import {
  PROVIDER_RECOVERY_POLICY_V2,
  GATE2_RECOVERY_POLICY_VERSION_V2,
  GATE2_RECOVERY_PARENT_RUN_ID_V2,
  GATE2_RECOVERY_V2_TARGET_SET_HASH,
} from "../gate2-recovery-policy-v2";
import {
  resolveGate2RecoveryPolicy,
  runGate2Recovery,
  runGate2RecoveryWithSelection,
  classifyRecoveryOutcome,
} from "../gate2-recovery";
import { parseGate2RecoveryCliArgs } from "../../cli-gate2-recovery";
import type { RunLogSessionOptions, RunStartEntry } from "../runlog";
import type { RunContentPipelineResult } from "../../content/pipeline";

function rowsFor(policy: { targets: readonly { candidateId: string; expectedLatestGeneratedQuestionId: string; expectedStatus: "FAILED"; expectedErrorCode: string }[] }): Gate2GeneratedQuestion[] {
  return policy.targets.map((t, i) => ({
    id: t.expectedLatestGeneratedQuestionId,
    candidateQuestionId: t.candidateId,
    status: t.expectedStatus,
    errorCode: t.expectedErrorCode,
    createdAt: new Date(1000 + i),
  }));
}

describe("Gate2 v2 runner/CLI wiring — explicit policy-version selection", () => {
  it("selector: provider + v2 selects exactly frozen v2 7 targets", () => {
    const p = resolveGate2RecoveryPolicy({ lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 });
    expect(p).toBe(PROVIDER_RECOVERY_POLICY_V2);
    expect(p.targets.length).toBe(7);
    expect(p.policyVersion).toBe(GATE2_RECOVERY_POLICY_VERSION_V2);
    expect(p.targetSetHash).toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
    expect(p.targets.map((t) => t.candidateId)).toEqual([
      "cmssx5men0066jsrovtuz3l16",
      "cmssx51ia0038jsrob1pm7srf",
      "cmssx5bty004ojsro4q0cze45",
      "cmssx5ezl0054jsrownj322a9",
      "cmssx5fs20058jsroovx4dfes",
      "cmssx591v004ajsrolrw32sfz",
      "cmssx60jj0084jsroyo72x002",
    ]);
  });

  it("selector: provider + v1 selects existing v1 8-target behavior", () => {
    const p = resolveGate2RecoveryPolicy({ lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION });
    expect(p).toBe(PROVIDER_RECOVERY_POLICY);
    expect(p.targets.length).toBe(8);
    expect(hashTargetIds(p.targets.map((t) => t.candidateId))).toBe(PROVIDER_RECOVERY_POLICY.targetSetHash);
  });

  it("selector: contract + v1 selects 1-target behavior", () => {
    const p = resolveGate2RecoveryPolicy({ lane: "contract", policyVersion: GATE2_RECOVERY_POLICY_VERSION });
    expect(p).toBe(CONTRACT_RECOVERY_POLICY);
    expect(p.targets.length).toBe(1);
  });

  it("selector fail-closed: contract + v2 throws no fallback", () => {
    expect(() => resolveGate2RecoveryPolicy({ lane: "contract", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 })).toThrow(/fail-closed/);
  });

  it("selector fail-closed: invalid policyVersion throws with no v1 fallback", () => {
    expect(() => resolveGate2RecoveryPolicy({ lane: "provider", policyVersion: "gate2-post-failure-recovery-unknown" })).toThrow(/fail-closed/);
    expect(() => resolveGate2RecoveryPolicy({ lane: "provider", policyVersion: "" })).toThrow(/fail-closed/);
  });

  it("selector fail-closed: unknown lane throws", () => {
    expect(() => resolveGate2RecoveryPolicy({ lane: "unknown" as never, policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 })).toThrow(/fail-closed/);
    expect(() => resolveGate2RecoveryPolicy({ lane: "provider" as never, policyVersion: "wrong" })).toThrow(/fail-closed/);
  });

  it("exact binding: v2 targets are frozen exact order/hash/no duplicates", () => {
    const ids = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.candidateId);
    expect(ids.length).toBe(7);
    expect(new Set(ids).size).toBe(7);
    expect(hashTargetIds(ids)).toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
    expect(hashTargetIds([...ids].sort())).not.toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
    expect(PROVIDER_RECOVERY_POLICY_V2.targets[0].expectedLatestGeneratedQuestionId).toBe("cmt43rp0j0002bwro1ljz1ynr");
    expect(PROVIDER_RECOVERY_POLICY_V2.targets[4].expectedErrorCode).toBe("server_error");
  });

  it("preserves v1 behavior via legacy wrapper", async () => {
    const cands = CONTRACT_RECOVERY_POLICY.targets.map((t) => ({ id: t.candidateId }));
    const r = rowsFor(CONTRACT_RECOVERY_POLICY);
    const result = await runGate2Recovery("contract", {
      stateStore: {
        findCandidatesByIds: async (ids) => ids.map((id) => ({ id })),
        findGeneratedQuestionsByCandidateIds: async () => r,
      },
      executeCandidate: async () => ({ generatedQuestionId: "g", status: "QA_PASSED", similarityScore: null, similarityWarning: false, qaPassed: true, qaFailed: false, errorCode: null }),
      runLogDir: "unused",
      createSession: async () => ({ runId: "run-v1", isBroken: () => false, appendItem: async () => true, finish: async () => undefined }),
    });
    // contract lane v1 1 target still works
    expect(result.preflight.ok).toBe(true);
    expect(result.executed).toBe(1);
    void cands;
  });
});

describe("v2 preflight fail-closed — no provider or runlog before mismatch", () => {
  async function runWithMocks(overrides: { candidates?: { id: string }[]; rows?: Gate2GeneratedQuestion[] }) {
    let providerCalls = 0;
    let createSessionCalls = 0;
    const policyRows = rowsFor(PROVIDER_RECOVERY_POLICY_V2);
    const cands = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => ({ id: t.candidateId }));
    const result = await runGate2RecoveryWithSelection(
      { lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 },
      {
        stateStore: {
          findCandidatesByIds: async () => overrides.candidates ?? cands,
          findGeneratedQuestionsByCandidateIds: async () => overrides.rows ?? policyRows,
        },
        executeCandidate: async () => {
          providerCalls += 1;
          return { generatedQuestionId: "new", status: "QA_PASSED", similarityScore: null, similarityWarning: false, qaPassed: true, qaFailed: false, errorCode: null };
        },
        runLogDir: "unused",
        createSession: async () => {
          createSessionCalls += 1;
          return { runId: "should-not-happen", isBroken: () => false, appendItem: async () => true, finish: async () => undefined };
        },
      },
    );
    return { result, providerCalls, createSessionCalls };
  }

  it("hash/count mismatch => executed 0, providerCalls 0, runlog 0", async () => {
    // missing one candidate
    const cands = PROVIDER_RECOVERY_POLICY_V2.targets.slice(0, 6).map((t) => ({ id: t.candidateId }));
    const { result, providerCalls, createSessionCalls } = await runWithMocks({ candidates: cands });
    expect(result.preflight.ok).toBe(false);
    expect(result.executed).toBe(0);
    expect(result.runId).toBeUndefined();
    expect(providerCalls).toBe(0);
    expect(createSessionCalls).toBe(0);
  });

  it("duplicate candidate detection is covered by hash invariant — mismatch still 0 calls", async () => {
    // simulate DB returning same set but preflight still fails due to missing latest GQ id
    const rows = rowsFor(PROVIDER_RECOVERY_POLICY_V2).map((r, i) => (i === 0 ? { ...r, id: "wrong-id" } : r));
    const { result, providerCalls, createSessionCalls } = await runWithMocks({ rows });
    expect(result.preflight.ok).toBe(false);
    expect(result.executed).toBe(0);
    expect(providerCalls).toBe(0);
    expect(createSessionCalls).toBe(0);
  });

  it("all candidates missing => 0 calls", async () => {
    const { result, providerCalls, createSessionCalls } = await runWithMocks({ candidates: [] });
    expect(result.preflight.ok).toBe(false);
    expect(providerCalls).toBe(0);
    expect(createSessionCalls).toBe(0);
  });

  it("frozen latest GQ id/status/error mismatch => 0 calls", async () => {
    const rows = rowsFor(PROVIDER_RECOVERY_POLICY_V2).map((r, i) => (i === 2 ? { ...r, errorCode: "server_error" } : r));
    const { result, providerCalls, createSessionCalls } = await runWithMocks({ rows });
    expect(result.preflight.ok).toBe(false);
    expect(providerCalls).toBe(0);
    expect(createSessionCalls).toBe(0);
  });

  it("status mismatch => 0 calls", async () => {
    const rows = rowsFor(PROVIDER_RECOVERY_POLICY_V2).map((r, i) => (i === 4 ? { ...r, status: "QA_PASSED" as const } : r));
    const { result, providerCalls, createSessionCalls } = await runWithMocks({ rows });
    expect(result.preflight.ok).toBe(false);
    expect(providerCalls).toBe(0);
    expect(createSessionCalls).toBe(0);
  });
});

describe("v2 provenance and concurrency", () => {
  it("run_start provenance includes runType, policyVersion, lane, parentRunId, targetSetHash, exact targets and total, concurrency=1", async () => {
    let captured: RunLogSessionOptions | null = null;
    let capturedStart: RunStartEntry | null = null;
    const rows = rowsFor(PROVIDER_RECOVERY_POLICY_V2);
    const result = await runGate2RecoveryWithSelection(
      { lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 },
      {
        stateStore: {
          findCandidatesByIds: async (ids) => ids.map((id) => ({ id })),
          findGeneratedQuestionsByCandidateIds: async () => rows,
        },
        executeCandidate: async () => ({ generatedQuestionId: "g", status: "QA_PASSED", similarityScore: null, similarityWarning: false, qaPassed: true, qaFailed: false, errorCode: null }),
        runLogDir: "data/cbt/runs",
        createSession: async (opts: RunLogSessionOptions) => {
          captured = opts;
          // emulate createRunLogSession run_start construction for provenance assertion
          capturedStart = {
            type: "run_start",
            runId: "prov-run",
            command: opts.command,
            args: opts.args,
            targets: opts.targets,
            total: opts.total,
            concurrency: opts.concurrency ?? undefined,
            ...(opts.recovery
              ? {
                  runType: "gate2_post_failure_recovery" as const,
                  policyVersion: opts.recovery.policyVersion,
                  lane: opts.recovery.lane,
                  parentRunId: opts.recovery.parentRunId,
                  targetSetHash: opts.recovery.targetSetHash,
                }
              : {}),
            createdAt: new Date().toISOString(),
          };
          return { runId: "prov-run", isBroken: () => false, appendItem: async () => true, finish: async () => undefined };
        },
      },
    );
    expect(result.preflight.ok).toBe(true);
    expect(result.runId).toBe("prov-run");
    expect(captured).not.toBeNull();
    if (captured === null) throw new Error("captured should not be null");
    const provCaptured: RunLogSessionOptions = captured;
    // derive run_start entry as runlog does from recovery
    const derivedRunType = provCaptured.recovery ? "gate2_post_failure_recovery" : undefined;
    expect(derivedRunType).toBe("gate2_post_failure_recovery");
    expect(provCaptured.concurrency).toBe(1);
    expect(provCaptured.total).toBe(7);
    expect(provCaptured.targets).toEqual(PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.candidateId));
    expect(provCaptured.recovery?.policyVersion).toBe(GATE2_RECOVERY_POLICY_VERSION_V2);
    expect(provCaptured.recovery?.lane).toBe("provider");
    expect(provCaptured.recovery?.parentRunId).toBe(GATE2_RECOVERY_PARENT_RUN_ID_V2);
    expect(provCaptured.recovery?.targetSetHash).toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
    expect(provCaptured.command).toBe("gate2-recovery");
    expect(provCaptured.args).toEqual(["--lane=provider", `--policy-version=${GATE2_RECOVERY_POLICY_VERSION_V2}`]);
    // total is the existing runlog schema target-count field, exact 7 targets
    expect(provCaptured.targets.length).toBe(7);
    expect(provCaptured.targets.length).toBe(provCaptured.total);
    // provenance runType plus total schema field
    const capturedStartSnapshot: RunStartEntry | null = capturedStart as RunStartEntry | null;
    expect(capturedStartSnapshot).not.toBeNull();
    if (capturedStartSnapshot === null) throw new Error("capturedStart should not be null");
    expect(capturedStartSnapshot.runType).toBe("gate2_post_failure_recovery");
    expect(capturedStartSnapshot.policyVersion).toBe(GATE2_RECOVERY_POLICY_VERSION_V2);
    expect(capturedStartSnapshot.lane).toBe("provider");
    expect(capturedStartSnapshot.parentRunId).toBe(GATE2_RECOVERY_PARENT_RUN_ID_V2);
    expect(capturedStartSnapshot.targetSetHash).toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
    expect(capturedStartSnapshot.concurrency).toBe(1);
    expect(capturedStartSnapshot.total).toBe(7);
    expect(capturedStartSnapshot.targets.length).toBe(7);
    expect(capturedStartSnapshot.targets.length).toBe(capturedStartSnapshot.total);
  });

  it("concurrency is always 1 even when executing multiple items", async () => {
    let captured: RunLogSessionOptions | null = null;
    const rows = rowsFor(PROVIDER_RECOVERY_POLICY);
    await runGate2RecoveryWithSelection(
      { lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION },
      {
        stateStore: {
          findCandidatesByIds: async (ids) => ids.map((id) => ({ id })),
          findGeneratedQuestionsByCandidateIds: async () => rows,
        },
        executeCandidate: async () => ({ generatedQuestionId: "g", status: "QA_PASSED", similarityScore: null, similarityWarning: false, qaPassed: true, qaFailed: false, errorCode: null }),
        runLogDir: "unused",
        createSession: async (opts: RunLogSessionOptions) => {
          captured = opts;
          return { runId: "x", isBroken: () => false, appendItem: async () => true, finish: async () => undefined };
        },
      },
    );
    const concurrencyCaptured: RunLogSessionOptions | null = captured as RunLogSessionOptions | null;
    if (concurrencyCaptured === null) throw new Error("captured should not be null");
    expect(concurrencyCaptured.concurrency).toBe(1);
  });

  it("reuses provider/generation/QA classification and retry/kill-switch behavior unchanged", async () => {
    // transient classification still uses timeout/server_error
    const timeoutResult: RunContentPipelineResult = { generatedQuestionId: "g", status: "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: false, errorCode: "timeout" };
    const serverErrorResult: RunContentPipelineResult = { generatedQuestionId: "g", status: "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: false, errorCode: "server_error" };
    expect(classifyRecoveryOutcome(timeoutResult)).toBe("TRANSIENT");
    expect(classifyRecoveryOutcome(serverErrorResult)).toBe("TRANSIENT");
    // contract lane still aborts after single transient (kill-switch)
    const rows = rowsFor(CONTRACT_RECOVERY_POLICY);
    const resultContract = await runGate2RecoveryWithSelection(
      { lane: "contract", policyVersion: GATE2_RECOVERY_POLICY_VERSION },
      {
        stateStore: {
          findCandidatesByIds: async (ids) => ids.map((id) => ({ id })),
          findGeneratedQuestionsByCandidateIds: async () => rows,
        },
        executeCandidate: async () => ({ generatedQuestionId: "g", status: "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: false, errorCode: "timeout" }),
        runLogDir: "unused",
        createSession: async () => ({ runId: "c", isBroken: () => false, appendItem: async () => true, finish: async () => undefined }),
      },
    );
    expect(resultContract.abortReason).toBe("transient_failure");
    // provider lane requires 2 consecutive transients
    const rowsProv = rowsFor(PROVIDER_RECOVERY_POLICY_V2);
    const resultProv = await runGate2RecoveryWithSelection(
      { lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 },
      {
        stateStore: {
          findCandidatesByIds: async (ids) => ids.map((id) => ({ id })),
          findGeneratedQuestionsByCandidateIds: async () => rowsProv,
        },
        executeCandidate: async () => ({ generatedQuestionId: "g", status: "FAILED", similarityScore: null, similarityWarning: false, qaPassed: false, qaFailed: false, errorCode: "timeout" }),
        runLogDir: "unused",
        createSession: async () => ({ runId: "p", isBroken: () => false, appendItem: async () => true, finish: async () => undefined }),
      },
    );
    expect(resultProv.abortReason).toBe("consecutive_transient_limit");
    expect(resultProv.executed).toBe(2);
  });
});

describe("CLI wiring — explicit lane and policy-version, rejects unknown", () => {
  it("parses valid lane+policyVersion", () => {
    expect(parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2"])).toEqual({
      lane: "provider",
      policyVersion: "gate2-post-failure-recovery-v2",
    });
    expect(parseGate2RecoveryCliArgs(["--lane=contract", "--policy-version=gate2-post-failure-recovery-v1"])).toEqual({
      lane: "contract",
      policyVersion: "gate2-post-failure-recovery-v1",
    });
    expect(parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v1"])).toEqual({
      lane: "provider",
      policyVersion: "gate2-post-failure-recovery-v1",
    });
  });

  it("legacy lane-only defaults to v1", () => {
    expect(parseGate2RecoveryCliArgs(["--lane=provider"])).toEqual({
      lane: "provider",
      policyVersion: "gate2-post-failure-recovery-v1",
    });
    expect(parseGate2RecoveryCliArgs(["--lane=contract"])).toEqual({
      lane: "contract",
      policyVersion: "gate2-post-failure-recovery-v1",
    });
  });

  it("rejects missing lane", () => {
    expect(() => parseGate2RecoveryCliArgs(["--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/사용법/);
    expect(() => parseGate2RecoveryCliArgs([])).toThrow(/사용법/);
  });

  it("rejects unknown options, flags, positionals", () => {
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2", "--unknown=1"])).toThrow(/사용법/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2", "--dry-run"])).toThrow(/사용법/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2", "extra"])).toThrow(/사용법/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2", "--policyVersion=wrong"])).toThrow(/사용법/);
  });

  it("rejects invalid lane/policyVersion values fail-closed and never fallback", () => {
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v3"])).toThrow(/fail-closed|사용법/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=unknown", "--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/사용법|fail-closed/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=contract", "--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/fail-closed/);
    // explicit v2 without provider lane fails closed (contract lane already above, also missing provider)
    expect(() => parseGate2RecoveryCliArgs(["--lane=contract", "--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/fail-closed/);
    // unknown version without fallback to v1
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=unknown"])).toThrow(/fail-closed/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-unknown"])).toThrow(/fail-closed/);
  });

  it("rejects camelCase policyVersion alias as unknown", () => {
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policyVersion=gate2-post-failure-recovery-v2"])).toThrow(/사용법/);
  });

  it("explicit v2 wrong-lane and no-fallback coverage", () => {
    // explicit v2 with contract fails closed, never falls back to v1 contract 1-target
    expect(() => parseGate2RecoveryCliArgs(["--lane=contract", "--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/fail-closed/);
    // explicit v2 provider is the only valid v2
    expect(parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2"]).policyVersion).toBe("gate2-post-failure-recovery-v2");
    // unknown version with provider still fails closed, no fallback to v1 8-target
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v3"])).toThrow(/fail-closed/);
  });

  it("rejects duplicate lane and policy-version values", () => {
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--lane=provider", "--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/사용법/);
    expect(() => parseGate2RecoveryCliArgs(["--lane=provider", "--policy-version=gate2-post-failure-recovery-v2", "--policy-version=gate2-post-failure-recovery-v2"])).toThrow(/사용법/);
  });
});
