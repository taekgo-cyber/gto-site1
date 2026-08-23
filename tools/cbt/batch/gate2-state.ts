import { createHash } from "node:crypto";
import type { GeneratedQuestionStatus } from "../content/types";
import type { Gate2RecoveryPolicy } from "./gate2-recovery-policy";

export type Gate2GeneratedQuestion = {
  id: string;
  candidateQuestionId: string;
  status: GeneratedQuestionStatus;
  errorCode: string | null;
  createdAt: Date;
};

export type Gate2StateStore = {
  findCandidatesByIds(ids: readonly string[]): Promise<Array<{ id: string }>>;
  findGeneratedQuestionsByCandidateIds(ids: readonly string[]): Promise<Gate2GeneratedQuestion[]>;
};

/** Gate 순서, UTF-8, trailing LF를 포함한 canonical hash. */
export function hashTargetIds(ids: readonly string[]): string {
  return createHash("sha256").update(`${ids.join("\n")}\n`, "utf8").digest("hex").toUpperCase();
}

export function selectLatestGeneratedQuestions(rows: readonly Gate2GeneratedQuestion[]): Map<string, Gate2GeneratedQuestion> {
  const latest = new Map<string, Gate2GeneratedQuestion>();
  for (const row of rows) {
    const previous = latest.get(row.candidateQuestionId);
    if (!previous || row.createdAt > previous.createdAt || (row.createdAt.getTime() === previous.createdAt.getTime() && row.id > previous.id)) {
      latest.set(row.candidateQuestionId, row);
    }
  }
  return latest;
}

export type RecoveryPreflight = { ok: boolean; reasons: string[]; latestByCandidate: Map<string, Gate2GeneratedQuestion> };

export function validateRecoveryPreflight(
  policy: Gate2RecoveryPolicy,
  candidates: readonly { id: string }[],
  generatedQuestions: readonly Gate2GeneratedQuestion[],
): RecoveryPreflight {
  const reasons: string[] = [];
  const ids = policy.targets.map((target) => target.candidateId);
  if (new Set(ids).size !== ids.length) reasons.push("policy target candidateId가 중복됩니다.");
  if (hashTargetIds(ids) !== policy.targetSetHash) reasons.push("frozen target hash가 policy와 일치하지 않습니다.");
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  if (candidateIds.size !== ids.length || ids.some((id) => !candidateIds.has(id))) reasons.push("frozen target count/id가 현재 DB와 일치하지 않습니다.");
  const latestByCandidate = selectLatestGeneratedQuestions(generatedQuestions);
  for (const target of policy.targets) {
    const latest = latestByCandidate.get(target.candidateId);
    if (!latest) { reasons.push(`${target.candidateId}: latest GeneratedQuestion이 없습니다.`); continue; }
    if (latest.id !== target.expectedLatestGeneratedQuestionId || latest.status !== target.expectedStatus || latest.errorCode !== target.expectedErrorCode) {
      reasons.push(`${target.candidateId}: frozen latest-state가 일치하지 않습니다.`);
    }
  }
  return { ok: reasons.length === 0, reasons, latestByCandidate };
}
