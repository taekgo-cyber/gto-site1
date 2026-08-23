import {
  laneEntries,
  loadAndVerifyResidualR1,
  verifyFrozenAgainstLive,
  type ResidualFreezeBinding,
  type ResidualLane,
  type ResidualLiveSnapshot,
  type ResidualOutcome,
  type ResidualHistoricalRow,
  verifyAppendOnly,
  type AppendOnlyVerificationResult,
} from "./residual-13-evidence";

export type ResidualRunMode = "preflight" | "dry-run" | "execute";
export const EXECUTE_CONFIRMATION_TOKEN = "EXECUTE_RECONSTRUCTED_RESIDUAL_13_ONCE";

export type ResidualRunRequest = {
  lane: ResidualLane;
  mode: ResidualRunMode;
  concurrency: 1;
  attemptBudgetPerCandidate: 1;
  expectedProvider: "zen";
  expectedModel: "deepseek-v4-flash";
  expectedGenerationPromptVersion: "step8-question-gen-v1.1";
  expectedQaPromptVersion: "step8-auto-qa-v3.1";
  confirmationToken?: string;
};

export type ResidualProductionResult = {
  generatedQuestionId: string | null;
  qaId: string | null;
  status: "QA_PASSED" | "FAILED" | "QA_FAILED";
};

export type ResidualProductionExecutor = {
  run(candidateId: string): Promise<ResidualProductionResult>;
};

export type ResidualItemResult = {
  candidateId: string;
  sourceQuestionId: string;
  lane: ResidualLane;
  attempted: boolean;
  logicalAttemptCount: 0 | 1;
  previousGeneratedQuestionId: string;
  newGeneratedQuestionId: string | null;
  newQaId: string | null;
  finalGeneratedQuestionStatus: ResidualProductionResult["status"] | null;
  outcome: ResidualOutcome | null;
};

export type ResidualRunResult = {
  mode: ResidualRunMode;
  lane: ResidualLane;
  targets: readonly string[];
  items: readonly ResidualItemResult[];
  attemptedCount: number;
  passedCount: number;
  quarantinedCount: number;
  incompleteCount: number;
  resolutionComplete: boolean;
  binding: ResidualFreezeBinding;
};

export type ResidualRunnerDeps = {
  binding?: ResidualFreezeBinding;
  liveSnapshot?: ResidualLiveSnapshot;
  executor?: ResidualProductionExecutor;
  beforeGq?: readonly ResidualHistoricalRow[];
  afterGq?: readonly ResidualHistoricalRow[];
  beforeQa?: readonly ResidualHistoricalRow[];
  afterQa?: readonly ResidualHistoricalRow[];
};

function validateRequest(request: ResidualRunRequest): void {
  if (request.concurrency !== 1) throw new Error("concurrency must be 1");
  if (request.attemptBudgetPerCandidate !== 1) throw new Error("attemptBudgetPerCandidate must be 1");
  if (request.expectedProvider !== "zen") throw new Error("provider config drift");
  if (request.expectedModel !== "deepseek-v4-flash") throw new Error("model config drift");
  if (request.expectedGenerationPromptVersion !== "step8-question-gen-v1.1") throw new Error("generation prompt config drift");
  if (request.expectedQaPromptVersion !== "step8-auto-qa-v3.1") throw new Error("QA prompt config drift");
  if (request.mode === "execute" && request.confirmationToken !== EXECUTE_CONFIRMATION_TOKEN) throw new Error("execute requires explicit confirmation token");
}

export async function runResidual13(
  request: ResidualRunRequest,
  deps: ResidualRunnerDeps = {},
): Promise<ResidualRunResult> {
  validateRequest(request);
  const binding = deps.binding ?? (await loadAndVerifyResidualR1());
  const entries = laneEntries(binding, request.lane);
  if (request.mode === "execute" && !deps.liveSnapshot) {
    throw new Error("execute requires a live snapshot");
  }
  if (deps.liveSnapshot) {
    const liveCheck = verifyFrozenAgainstLive(binding, deps.liveSnapshot);
    if (!liveCheck.ok) throw new Error(`live state drift: ${liveCheck.reasons.join("; ")}`);
  }
  if (request.mode === "execute" && !deps.executor) throw new Error("execute requires a production executor dependency");

  const targets = entries.map((entry) => entry.candidateId);
  const items: ResidualItemResult[] = [];
  const ledger = new Map<string, number>();
  for (const entry of entries) {
    if ((ledger.get(entry.candidateId) ?? 0) !== 0) throw new Error(`attempt budget already consumed: ${entry.candidateId}`);
    if (request.mode !== "execute") {
      items.push({
        candidateId: entry.candidateId,
        sourceQuestionId: entry.sourceQuestionId,
        lane: request.lane,
        attempted: false,
        logicalAttemptCount: 0,
        previousGeneratedQuestionId: entry.latestGeneratedQuestionId,
        newGeneratedQuestionId: null,
        newQaId: null,
        finalGeneratedQuestionStatus: null,
        outcome: null,
      });
      continue;
    }
    ledger.set(entry.candidateId, 1);
    const production = await deps.executor!.run(entry.candidateId);
    const outcome: ResidualOutcome = production.status === "QA_PASSED" ? "QA_PASSED" : production.status === "FAILED" ? "QUARANTINED_FAILED" : "QUARANTINED_QA_FAILED";
    items.push({
      candidateId: entry.candidateId,
      sourceQuestionId: entry.sourceQuestionId,
      lane: request.lane,
      attempted: true,
      logicalAttemptCount: 1,
      previousGeneratedQuestionId: entry.latestGeneratedQuestionId,
      newGeneratedQuestionId: production.generatedQuestionId,
      newQaId: production.qaId,
      finalGeneratedQuestionStatus: production.status,
      outcome,
    });
  }
  const attemptedCount = items.filter((item) => item.attempted).length;
  const passedCount = items.filter((item) => item.outcome === "QA_PASSED").length;
  const quarantinedCount = items.filter((item) => item.outcome?.startsWith("QUARANTINED") === true).length;
  const incompleteCount = items.filter((item) => item.outcome === null).length;
  const appendOnly: AppendOnlyVerificationResult = deps.beforeGq && deps.afterGq && deps.beforeQa && deps.afterQa
    ? verifyAppendOnly(deps.beforeGq, deps.afterGq, deps.beforeQa, deps.afterQa, targets)
    : { ok: true, reasons: [], unexpectedCandidateIds: [], deletedIds: [], mutatedIds: [] };
  if (!appendOnly.ok) throw new Error(`append-only verification failed: ${appendOnly.reasons.join("; ")}`);
  if (request.mode === "execute" && attemptedCount !== targets.length) throw new Error("R3_EXECUTION_INCOMPLETE");
  return {
    mode: request.mode,
    lane: request.lane,
    targets,
    items,
    attemptedCount,
    passedCount,
    quarantinedCount,
    incompleteCount,
    resolutionComplete: request.mode === "execute" && incompleteCount === 0 && appendOnly.ok,
    binding,
  };
}
