import type { RunContentPipelineResult } from "../content/pipeline";
import { isProviderTransient } from "./failure-classification";
import {
  GATE2_RECOVERY_POLICY_VERSION,
  getGate2RecoveryPolicy,
  type Gate2RecoveryPolicy,
  type RecoveryLane,
} from "./gate2-recovery-policy";
import {
  GATE2_RECOVERY_POLICY_VERSION_V2,
  PROVIDER_RECOVERY_POLICY_V2,
  type Gate2RecoveryPolicyV2,
} from "./gate2-recovery-policy-v2";
import { validateRecoveryPreflight, type Gate2StateStore, type RecoveryPreflight } from "./gate2-state";
import { createRunLogSession, type RunLogSession } from "./runlog";

export type Gate2RecoverySelection = {
  lane: RecoveryLane;
  policyVersion: string;
};

export type AnyGate2RecoveryPolicy = Gate2RecoveryPolicy | Gate2RecoveryPolicyV2;

/**
 * Explicit policy-version selection — fail-closed with no v1 fallback.
 * - provider + gate2-post-failure-recovery-v2 => frozen v2 7 targets
 * - provider|contract + gate2-post-failure-recovery-v1 => existing v1 8/1 targets
 * - any other lane/policyVersion => throw (fail-closed)
 */
export function resolveGate2RecoveryPolicy(selection: Gate2RecoverySelection): AnyGate2RecoveryPolicy {
  const { lane, policyVersion } = selection;
  if (policyVersion === GATE2_RECOVERY_POLICY_VERSION_V2) {
    if (lane !== "provider") {
      throw new Error(`fail-closed: unknown selection lane=${lane} policyVersion=${policyVersion}`);
    }
    return PROVIDER_RECOVERY_POLICY_V2;
  }
  if (policyVersion === GATE2_RECOVERY_POLICY_VERSION) {
    if (lane !== "contract" && lane !== "provider") {
      throw new Error(`fail-closed: unknown selection lane=${lane} policyVersion=${policyVersion}`);
    }
    return getGate2RecoveryPolicy(lane);
  }
  throw new Error(`fail-closed: unknown selection lane=${lane} policyVersion=${policyVersion}`);
}

export type RecoveryItemOutcome = "QA_PASSED" | "QA_FAILED" | "TRANSIENT" | "TERMINAL";
export type Gate2RecoveryResult = {
  preflight: RecoveryPreflight;
  runId?: string;
  executed: number;
  outcomes: RecoveryItemOutcome[];
  qaPassed: number;
  qaFailed: number;
  transient: number;
  terminal: number;
  aborted: boolean;
  abortReason?: "recovery_stop" | "log_failure" | "transient_failure" | "consecutive_transient_limit" | "terminal_failure";
};

export type Gate2RecoveryDeps = {
  stateStore: Gate2StateStore;
  executeCandidate(candidateId: string): Promise<RunContentPipelineResult>;
  runLogDir: string;
  createSession?: typeof createRunLogSession;
};

export function classifyRecoveryOutcome(result: RunContentPipelineResult): RecoveryItemOutcome {
  if (result.status === "QA_PASSED") return "QA_PASSED";
  if (result.status === "QA_FAILED") return "QA_FAILED";
  return isProviderTransient(result.errorCode) ? "TRANSIENT" : "TERMINAL";
}

async function runWithPolicy(policy: AnyGate2RecoveryPolicy, deps: Gate2RecoveryDeps): Promise<Gate2RecoveryResult> {
  const ids = policy.targets.map((target) => target.candidateId);
  const [candidates, generatedQuestions] = await Promise.all([
    deps.stateStore.findCandidatesByIds(ids),
    deps.stateStore.findGeneratedQuestionsByCandidateIds(ids),
  ]);
  const preflight = validateRecoveryPreflight(
    policy as unknown as Gate2RecoveryPolicy,
    candidates,
    generatedQuestions,
  );
  if (!preflight.ok)
    return {
      preflight,
      executed: 0,
      outcomes: [],
      qaPassed: 0,
      qaFailed: 0,
      transient: 0,
      terminal: 0,
      aborted: true,
      abortReason: "recovery_stop",
    };

  const sessionFactory = deps.createSession ?? createRunLogSession;
  const session: RunLogSession = await sessionFactory({
    dir: deps.runLogDir,
    command: "gate2-recovery",
    args: [`--lane=${policy.lane}`, `--policy-version=${policy.policyVersion}`],
    targets: ids,
    total: ids.length,
    concurrency: 1,
    recovery: {
      policyVersion: policy.policyVersion,
      lane: policy.lane,
      parentRunId: policy.parentRunId,
      targetSetHash: policy.targetSetHash,
    },
  });
  const startedAt = Date.now();
  const outcomes: RecoveryItemOutcome[] = [];
  let succeeded = 0;
  let failed = 0;
  let qaFailed = 0;
  let transient = 0;
  let terminal = 0;
  let consecutiveTransients = 0;
  let abortReason: Gate2RecoveryResult["abortReason"];

  for (const candidateId of ids) {
    let outcome: RecoveryItemOutcome;
    let detail: string | undefined;
    try {
      const result = await deps.executeCandidate(candidateId);
      outcome = classifyRecoveryOutcome(result);
      detail = result.errorCode ?? result.status;
    } catch (error) {
      outcome = "TERMINAL";
      detail = error instanceof Error ? error.message : String(error);
    }
    outcomes.push(outcome);
    if (outcome === "QA_PASSED") succeeded += 1;
    else {
      failed += 1;
      if (outcome === "QA_FAILED") qaFailed += 1;
      if (outcome === "TRANSIENT") transient += 1;
      if (outcome === "TERMINAL") terminal += 1;
    }
    const appended = await session.appendItem(candidateId, outcome === "QA_PASSED" ? "succeeded" : "failed", detail);
    if (!appended) {
      abortReason = "log_failure";
      break;
    }
    if (outcome === "TRANSIENT") {
      consecutiveTransients += 1;
      if (policy.lane === "contract") {
        abortReason = "transient_failure";
        break;
      }
      if (consecutiveTransients >= 2) {
        abortReason = "consecutive_transient_limit";
        break;
      }
    } else {
      consecutiveTransients = 0;
      if (outcome === "TERMINAL") {
        abortReason = "terminal_failure";
        break;
      }
    }
  }
  const aborted = abortReason !== undefined;
  await session.finish(succeeded, failed, Date.now() - startedAt, aborted ? { aborted: true, abortReason } : undefined);
  return {
    preflight,
    runId: session.runId,
    executed: outcomes.length,
    outcomes,
    qaPassed: succeeded,
    qaFailed,
    transient,
    terminal,
    aborted,
    abortReason,
  };
}

/**
 * 전용 recovery runner. preflight가 통과한 뒤에만 run_start/DB/provider 호출을 허용한다.
 * 일반 --resume 및 candidate-query를 사용하지 않으며, policy당 한 번의 논리 실행만 한다.
 * v1 호환 래퍼 — 명시적 policyVersion 선택은 runGate2RecoveryWithSelection을 사용한다.
 */
export async function runGate2Recovery(lane: RecoveryLane, deps: Gate2RecoveryDeps): Promise<Gate2RecoveryResult> {
  const policy = getGate2RecoveryPolicy(lane);
  return runWithPolicy(policy, deps);
}

/**
 * Explicit policy-version recovery runner — fail-closed.
 * CLI는 이 진입점을 통해 단일 명시적 설정 경로로만 실행해야 한다.
 */
export async function runGate2RecoveryWithSelection(
  selection: Gate2RecoverySelection,
  deps: Gate2RecoveryDeps,
): Promise<Gate2RecoveryResult> {
  const policy = resolveGate2RecoveryPolicy(selection);
  return runWithPolicy(policy, deps);
}
