// Gate 2 Operational Closeout Evaluator — bounded closeout decision.
// - baseSystemDecision is always FAIL (5 transient failures exceed normal Gate 2 system threshold).
// - Operational result is named GATE2_OPERATIONAL_CLOSEOUT_PASS or GATE2_OPERATIONAL_CLOSEOUT_FAIL.
// - Never gate2Pass=true and never relabel a normal Gate 2 system PASS.
// - Aborted recovery runs remain aborted=true and passRelevant=false; they cannot be used as completed relevant runs.
// - Exact frozen excluded IDs/GQ IDs/error codes must match, even if statuses later change.

import { isProviderTransient } from "./failure-classification";
import {
  GATE2_BASE_SYSTEM_DECISION,
  GATE2_OPERATIONAL_CLOSEOUT_PASS,
  GATE2_OPERATIONAL_CLOSEOUT_FAIL,
  GATE2_CLOSEOUT_TOTAL,
  GATE2_CLOSEOUT_LATEST_COUNT,
  GATE2_CLOSEOUT_TERMINAL_COUNT,
  GATE2_CLOSEOUT_INCOMPLETE_COUNT,
  GATE2_CLOSEOUT_QA_PASSED_COUNT,
  GATE2_CLOSEOUT_QA_FAILED_COUNT,
  GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT,
  GATE2_CLOSEOUT_RESOLVED_COUNT,
  GATE2_CLOSEOUT_COVERAGE_RATIO,
  GATE2_CLOSEOUT_SEMANTIC_PASS_RATIO,
  GATE2_CLOSEOUT_AUDIT_ERRORS,
  GATE2_CLOSEOUT_AUDIT_WARNINGS,
  GATE2_CLOSEOUT_EXCLUDED_COUNT,
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES,
  GATE2_CLOSEOUT_CIRCUIT_OPEN_COUNT,
  GATE2_CLOSEOUT_PROMOTE_ELIGIBILITY,
  validateGate2CloseoutTargetIdentity,
  isGate2CloseoutExcludedErrorCode,
} from "./gate2-closeout-policy";
import {
  verifyScopedAppendOnly,
  type CloseoutScopedRows,
} from "./gate2-closeout-evidence";
import { FROZEN_GATE_TARGET_IDS } from "./gate2-frozen-gate";
import type { Gate2GeneratedQuestion } from "./gate2-state";

export type Gate2CloseoutRelevantRun = {
  runId: string;
  complete: boolean;
  aborted: boolean;
  circuitOpenCount: number;
};

export type Gate2CloseoutEvaluationInput = {
  /** defaults to the frozen Gate 2 target set */
  targetIds?: readonly string[];
  latestByCandidate: ReadonlyMap<string, Gate2GeneratedQuestion>;
  /** baseline scoped rows for append-only check (optional but recommended) */
  baselineScopedRows?: CloseoutScopedRows;
  /** current scoped rows for append-only check (optional but recommended) */
  currentScopedRows?: CloseoutScopedRows;
  relevantRuns?: readonly Gate2CloseoutRelevantRun[];
  datasetAuditPassed?: boolean;
  auditErrors?: number;
  auditWarnings?: number;
};

export type Gate2CloseoutEvaluation = {
  decision: typeof GATE2_OPERATIONAL_CLOSEOUT_PASS | typeof GATE2_OPERATIONAL_CLOSEOUT_FAIL;
  baseSystemDecision: typeof GATE2_BASE_SYSTEM_DECISION;
  total: number;
  latest: number;
  qaPassed: number;
  qaFailed: number;
  transientFailed: number;
  terminalFailed: number;
  incomplete: number;
  resolved: number;
  coverage: number;
  semanticPassRate: number | null;
  excludedCount: number;
  excludedMatch: boolean;
  excludedReasonsAllowed: boolean;
  appendOnlyPassed: boolean;
  auditPassed: boolean;
  circuitOpenCount: number;
  promoteEligibility: boolean;
  reasons: string[];
};

export function evaluateGate2OperationalCloseout(
  input: Gate2CloseoutEvaluationInput,
): Gate2CloseoutEvaluation {
  const reasons: string[] = [];
  const targetIds = input.targetIds ?? [...FROZEN_GATE_TARGET_IDS];

  const targetIdentityError = validateGate2CloseoutTargetIdentity(targetIds);
  if (targetIdentityError) {
    reasons.push(`target_identity:${targetIdentityError}`);
  }

  // Count latest states for the 50 candidates.
  let qaPassed = 0;
  let qaFailed = 0;
  let transientFailed = 0;
  let terminalFailed = 0;
  let incomplete = 0;
  let latest = 0;

  for (const candidateId of targetIds) {
    const gq = input.latestByCandidate.get(candidateId);
    if (!gq) {
      incomplete += 1;
      continue;
    }
    latest += 1;
    if (gq.status === "QA_PASSED") qaPassed += 1;
    else if (gq.status === "QA_FAILED") qaFailed += 1;
    else if (gq.status === "FAILED" && isProviderTransient(gq.errorCode)) {
      transientFailed += 1;
    } else if (gq.status === "FAILED") {
      terminalFailed += 1;
    } else {
      // Any other status (GENERATED, QA_PENDING, etc.) is considered incomplete for closeout.
      incomplete += 1;
    }
  }

  const resolved = qaPassed + qaFailed;
  const coverage = resolved / GATE2_CLOSEOUT_TOTAL;
  const semanticPassRate = resolved === 0 ? null : qaPassed / resolved;

  // Exact frozen count checks.
  if (targetIds.length !== GATE2_CLOSEOUT_TOTAL) {
    reasons.push(`total_count=${targetIds.length} expected=${GATE2_CLOSEOUT_TOTAL}`);
  }
  if (latest !== GATE2_CLOSEOUT_LATEST_COUNT) {
    reasons.push(`latest_count=${latest} expected=${GATE2_CLOSEOUT_LATEST_COUNT}`);
  }
  if (incomplete !== GATE2_CLOSEOUT_INCOMPLETE_COUNT) {
    reasons.push(`incomplete_count=${incomplete} expected=${GATE2_CLOSEOUT_INCOMPLETE_COUNT}`);
  }
  if (terminalFailed !== GATE2_CLOSEOUT_TERMINAL_COUNT) {
    reasons.push(`terminal_failed=${terminalFailed} expected=${GATE2_CLOSEOUT_TERMINAL_COUNT}`);
  }
  if (transientFailed !== GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT) {
    reasons.push(`transient_failed=${transientFailed} expected=${GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT}`);
  }
  if (qaPassed !== GATE2_CLOSEOUT_QA_PASSED_COUNT) {
    reasons.push(`qa_passed=${qaPassed} expected=${GATE2_CLOSEOUT_QA_PASSED_COUNT}`);
  }
  if (qaFailed !== GATE2_CLOSEOUT_QA_FAILED_COUNT) {
    reasons.push(`qa_failed=${qaFailed} expected=${GATE2_CLOSEOUT_QA_FAILED_COUNT}`);
  }
  if (resolved !== GATE2_CLOSEOUT_RESOLVED_COUNT) {
    reasons.push(`resolved=${resolved} expected=${GATE2_CLOSEOUT_RESOLVED_COUNT}`);
  }
  if (Math.abs(coverage - GATE2_CLOSEOUT_COVERAGE_RATIO) > 1e-9) {
    reasons.push(`coverage=${coverage.toFixed(4)} expected=${GATE2_CLOSEOUT_COVERAGE_RATIO}`);
  }
  if (
    semanticPassRate === null ||
    Math.abs(semanticPassRate - GATE2_CLOSEOUT_SEMANTIC_PASS_RATIO) > 1e-9
  ) {
    reasons.push(
      `semantic_pass_rate=${semanticPassRate === null ? "N/A" : semanticPassRate.toFixed(4)} expected=${GATE2_CLOSEOUT_SEMANTIC_PASS_RATIO.toFixed(4)}`,
    );
  }

  // Exact excluded entry checks (identity, status, error code).
  let excludedMatch = true;
  let excludedReasonsAllowed = true;
  for (const entry of GATE2_CLOSEOUT_EXCLUDED_ENTRIES) {
    const latestGq = input.latestByCandidate.get(entry.candidateId);
    if (!latestGq) {
      excludedMatch = false;
      reasons.push(`excluded_missing:${entry.candidateId}`);
      continue;
    }
    if (
      latestGq.id !== entry.generatedQuestionId ||
      latestGq.status !== entry.status ||
      latestGq.errorCode !== entry.errorCode
    ) {
      excludedMatch = false;
      reasons.push(
        `excluded_mismatch:${entry.candidateId} expected=${entry.generatedQuestionId}/${entry.status}/${entry.errorCode} got=${latestGq.id}/${latestGq.status}/${latestGq.errorCode}`,
      );
    }
    if (!isGate2CloseoutExcludedErrorCode(latestGq.errorCode)) {
      excludedReasonsAllowed = false;
      reasons.push(
        `excluded_disallowed_reason:${entry.candidateId} errorCode=${latestGq.errorCode}`,
      );
    }
  }

  // Audit checks.
  const auditErrors = input.auditErrors ?? 0;
  const auditWarnings = input.auditWarnings ?? 0;
  const auditPassed =
    input.datasetAuditPassed === true &&
    auditErrors === GATE2_CLOSEOUT_AUDIT_ERRORS &&
    auditWarnings === GATE2_CLOSEOUT_AUDIT_WARNINGS;
  if (!auditPassed) {
    reasons.push(
      `audit_not_clean: passed=${input.datasetAuditPassed} errors=${auditErrors} warnings=${auditWarnings}`,
    );
  }

  // Relevant run checks.
  let circuitOpenCount = 0;
  const relevantRuns = input.relevantRuns ?? [];
  for (const run of relevantRuns) {
    if (!run.complete || run.aborted) {
      reasons.push(`relevant_run_aborted_or_incomplete:${run.runId}`);
    }
    circuitOpenCount += run.circuitOpenCount;
  }
  if (circuitOpenCount !== GATE2_CLOSEOUT_CIRCUIT_OPEN_COUNT) {
    reasons.push(`circuit_open=${circuitOpenCount} expected=${GATE2_CLOSEOUT_CIRCUIT_OPEN_COUNT}`);
  }

  // Scoped append-only checks.
  let appendOnlyPassed = true;
  if (input.baselineScopedRows && input.currentScopedRows) {
    const check = verifyScopedAppendOnly(
      input.baselineScopedRows,
      input.currentScopedRows,
    );
    appendOnlyPassed = check.appendOnlyPassed;
    if (!check.appendOnlyPassed) {
      reasons.push(
        `scoped_append_only_failed: deleted=${check.deletedCount} mutated=${check.mutatedCount}`,
      );
    }
  }

  // Promote eligibility: the excluded set is not APPROVED, so the frozen closeout is not eligible for promotion.
  // Promote eligibility is derived from state and policy, not a hard gate for the closeout itself.
  const promoteEligibility = GATE2_CLOSEOUT_PROMOTE_ELIGIBILITY;

  const decision =
    reasons.length === 0 ? GATE2_OPERATIONAL_CLOSEOUT_PASS : GATE2_OPERATIONAL_CLOSEOUT_FAIL;

  return {
    decision,
    baseSystemDecision: GATE2_BASE_SYSTEM_DECISION,
    total: targetIds.length,
    latest,
    qaPassed,
    qaFailed,
    transientFailed,
    terminalFailed,
    incomplete,
    resolved,
    coverage,
    semanticPassRate,
    excludedCount: GATE2_CLOSEOUT_EXCLUDED_COUNT,
    excludedMatch,
    excludedReasonsAllowed,
    appendOnlyPassed,
    auditPassed,
    circuitOpenCount,
    promoteEligibility,
    reasons,
  };
}

export function isGate2CloseoutPass(
  evaluation: Gate2CloseoutEvaluation,
): boolean {
  return evaluation.decision === GATE2_OPERATIONAL_CLOSEOUT_PASS;
}
