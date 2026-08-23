import { isProviderTransient } from "./failure-classification";
import { hashTargetIds, type Gate2GeneratedQuestion } from "./gate2-state";

export type Gate2IntegrityEvidence = {
  gateTargetHash: string;
  relevantRunIds: readonly string[];
  baselineIdentity: string;
  preSnapshotIdentity: string;
  postSnapshotIdentity: string;
  appendOnlyPassed: boolean;
  historicalMutationCount: number;
  targetExternalChangeCount: number;
};

export type Gate2FinalEvaluationInput = {
  targetIds: readonly string[];
  latestByCandidate: ReadonlyMap<string, Gate2GeneratedQuestion>;
  relevantRuns: readonly { runId: string; complete: boolean; aborted: boolean; circuitOpenCount: number }[];
  datasetAuditPassed: boolean;
  integrityEvidence?: Gate2IntegrityEvidence;
};
export type Gate2FinalEvaluation = {
  decision: "PASS" | "FAIL";
  qaPassed: number; qaFailed: number; transientFailed: number; terminalFailed: number; incomplete: number;
  semanticPassRate: number | null;
  reasons: string[];
};

/** original final-50의 latest state만 사용해 Gate 2의 system pass를 정확히 판정한다. */
export function evaluateGate2Final(input: Gate2FinalEvaluationInput): Gate2FinalEvaluation {
  let qaPassed = 0, qaFailed = 0, transientFailed = 0, terminalFailed = 0, incomplete = 0;
  for (const candidateId of input.targetIds) {
    const latest = input.latestByCandidate.get(candidateId);
    if (!latest) { incomplete += 1; continue; }
    if (latest.status === "QA_PASSED") qaPassed += 1;
    else if (latest.status === "QA_FAILED") qaFailed += 1;
    else if (latest.status === "FAILED" && isProviderTransient(latest.errorCode)) transientFailed += 1;
    else terminalFailed += 1;
  }
  const semanticPassRate = qaPassed + qaFailed === 0 ? null : qaPassed / (qaPassed + qaFailed);
  const reasons: string[] = [];
  if (incomplete > 0) reasons.push(`incomplete=${incomplete}`);
  if (terminalFailed > 0) reasons.push(`terminal_failed=${terminalFailed}`);
  if (transientFailed > 2) reasons.push(`transient_failed=${transientFailed} (max 2)`);
  if (semanticPassRate === null || semanticPassRate < 0.7) reasons.push(`semantic_pass_rate=${semanticPassRate === null ? "N/A" : semanticPassRate.toFixed(4)} (<0.70)`);
  if (!input.relevantRuns.every((run) => run.complete && !run.aborted)) reasons.push("relevant runlog가 complete하지 않습니다.");
  if (input.relevantRuns.some((run) => run.circuitOpenCount > 0)) reasons.push("relevant runlog에 circuit_open이 있습니다.");
  if (!input.datasetAuditPassed) reasons.push("dataset audit error가 있습니다.");
  const evidence = input.integrityEvidence;
  const expectedRunIds = input.relevantRuns.map((run) => run.runId).sort();
  const evidenceRunIds = evidence ? [...evidence.relevantRunIds].sort() : [];
  const evidenceBound = evidence !== undefined && evidence.gateTargetHash === hashTargetIds(input.targetIds) &&
    evidenceRunIds.length === expectedRunIds.length && evidenceRunIds.every((id, index) => id === expectedRunIds[index]) &&
    evidence.baselineIdentity !== "" && evidence.preSnapshotIdentity !== "" && evidence.postSnapshotIdentity !== "";
  if (!evidenceBound || !evidence?.appendOnlyPassed || evidence.historicalMutationCount !== 0 || evidence.targetExternalChangeCount !== 0) reasons.push("append-only integrity evidence가 이번 target/run에 결속되어 통과하지 않았습니다.");
  return { decision: reasons.length === 0 ? "PASS" : "FAIL", qaPassed, qaFailed, transientFailed, terminalFailed, incomplete, semanticPassRate, reasons };
}
