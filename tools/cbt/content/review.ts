// STEP 8 — Human Review (STEP 8 §18).
// 복잡한 Admin UI 없이 CLI로 approve/reject를 수행한다.
// - approve: QA_PASSED 또는 HUMAN_REVIEW 상태만 APPROVED로 전이한다.
// - reject: QA_PASSED/HUMAN_REVIEW/QA_FAILED 상태를 REJECTED로 전이한다.
// - 자동으로 APPROVED 상태를 만들지 않는다 (항상 사람이 CLI로 실행).
// - 승격(promote) 전에는 반드시 APPROVED 상태여야 한다.
import type { GeneratedQuestionStatus } from "./types";
import type { ContentDb } from "./persist/content-repository";
import {
  findGeneratedQuestionById,
  updateReviewFields,
} from "./persist/content-repository";

export type ReviewAction = "approve" | "reject";

export type ReviewOutcome = {
  id: string;
  status: GeneratedQuestionStatus;
  action: ReviewAction;
  alreadyResolved: boolean;
};

const APPROVE_ALLOWED: readonly GeneratedQuestionStatus[] = [
  "QA_PASSED",
  "HUMAN_REVIEW",
];

const REJECT_ALLOWED: readonly GeneratedQuestionStatus[] = [
  "QA_PASSED",
  "HUMAN_REVIEW",
  "QA_FAILED",
];

function isActionable(
  status: GeneratedQuestionStatus,
  allowed: readonly GeneratedQuestionStatus[],
): boolean {
  return (allowed as readonly string[]).includes(status);
}

/**
 * 사람의 검토 결정을 반영한다.
 * - 이미 같은 결정(APPROVED/REJECTED)인 경우 idempotent하게 현재 상태를 반환한다.
 * - 허용되지 않는 상태에서의 전이는 Error로 거부한다 (승격 전 APPROVED 강제).
 */
export async function reviewGeneratedQuestion(
  db: ContentDb,
  id: string,
  action: ReviewAction,
  reviewedBy?: string,
): Promise<ReviewOutcome> {
  const question = await findGeneratedQuestionById(db, id);
  if (!question) {
    throw new Error(`generated question not found: ${id}`);
  }

  const current = question.status as GeneratedQuestionStatus;

  if (action === "approve") {
    if (current === "APPROVED") {
      return { id, status: current, action, alreadyResolved: true };
    }
    if (!isActionable(current, APPROVE_ALLOWED)) {
      throw new Error(
        `approve 불가: 현재 상태 ${current} (QA_PASSED 또는 HUMAN_REVIEW만 가능)`,
      );
    }
    const updated = await updateReviewFields(db, id, "APPROVED", reviewedBy);
    return { id, status: updated.status as GeneratedQuestionStatus, action, alreadyResolved: false };
  }

  // reject
  if (current === "REJECTED") {
    return { id, status: current, action, alreadyResolved: true };
  }
  if (!isActionable(current, REJECT_ALLOWED)) {
    throw new Error(
      `reject 불가: 현재 상태 ${current} (QA_PASSED/HUMAN_REVIEW/QA_FAILED만 가능)`,
    );
  }
  const updated = await updateReviewFields(db, id, "REJECTED", reviewedBy);
  return { id, status: updated.status as GeneratedQuestionStatus, action, alreadyResolved: false };
}
