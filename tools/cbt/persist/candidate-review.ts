// STEP 6 — 리뷰 메타데이터 (Session 10-1 STEP 6 §26, STEP 6.1 §8).
// - VALID가 아닌 후보만 CandidateReview를 가진다.
// - 동일 데이터 재실행: 기존 review 상태를 그대로 보존한다 (RESOLVED 유지).
// - 실제 내용 변경(contentChanged=true) 감지 시: 기존 review를 PENDING으로 재개한다.
//   (이전 리뷰는 이전 내용에 대한 것이므로 재검토 필요)
// - 단순히 모든 UPDATE마다 PENDING으로 초기화하지 않는다.

import type { Prisma } from "@/generated/prisma/client";
import type { NormalizedQuestion } from "../types";
import type { CandidateDb } from "./candidate-repository";

export type CandidateReviewResult = {
  id: string;
  reviewStatus: string;
};

/**
 * 후보의 review 상태를 보존/재개한다.
 * 반환값은 현재 review(PENDING/RESOLVED/IGNORED) 또는 null(리뷰 불필요).
 * contentChanged=true면 기존 review가 있으면 PENDING으로 재개한다.
 */
export async function upsertReviewForValidationStatus(
  db: CandidateDb,
  candidateQuestionId: string,
  normalized: NormalizedQuestion,
  contentChanged: boolean,
): Promise<CandidateReviewResult | null> {
  const needsReview = normalized.validationStatus !== "VALID";
  const existing = await db.candidateReview.findUnique({
    where: { candidateQuestionId },
  });

  // 리뷰 불필요(VALID) + 내용 변경 없음 → review 없음 유지
  if (!needsReview && !contentChanged) return null;
  // 리뷰 불필요(VALID) + 변경 + 기존 review 없음 → 만들 필요 없음
  if (!needsReview && !existing) return null;

  if (existing) {
    // 동일 내용이면 기존 상태(RESOLVED/IGNORED/PENDING)를 그대로 보존
    if (!contentChanged) return existing;
    // 실제 내용 변경 → 이전 리뷰는 이전 내용 기준이므로 PENDING으로 재개
    return db.candidateReview.update({
      where: { candidateQuestionId },
      data: {
        reviewStatus: "PENDING",
        resolvedAt: null,
        validationErrors:
          normalized.validationErrors as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // 기존 review 없음 + 리뷰 필요(REVIEW_REQUIRED/REJECTED) → PENDING 생성
  return db.candidateReview.create({
    data: {
      candidateQuestionId,
      validationErrors:
        normalized.validationErrors as unknown as Prisma.InputJsonValue,
      reviewStatus: "PENDING",
    },
  });
}
