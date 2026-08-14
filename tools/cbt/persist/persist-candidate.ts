// STEP 6 — Candidate 영속 오케스트레이션 (Session 10-1 STEP 6 §26).
// 1) rawHtmlSnippet을 content-addressable 저장소에 저장 → rawHtmlSnippetId 산출
// 2) DB 트랜잭션 안에서 candidate upsert → review → duplicate group 등록
// snippet 저장(fs)은 트랜잭션 밖에서 수행하고, DB 쓰기만 $transaction으로 묶는다.

import { CBT_SNIPPETS_DIR } from "../config";
import type { NormalizedQuestion } from "../types";
import {
  upsertCandidateQuestion,
  type CandidateDb,
} from "./candidate-repository";
import { upsertReviewForValidationStatus } from "./candidate-review";
import { registerDuplicateIfNeeded } from "./duplicate-group";
import {
  createSnippetStorage,
  type SnippetStorage,
} from "./snippet-storage";

export type PersistCandidateRequest = {
  question: NormalizedQuestion;
  /** 문제 container의 raw HTML 원문. null이면 snippet 저장 생략 */
  rawHtmlSnippet: string | null;
};

export type PersistCandidateDeps = {
  storage?: SnippetStorage;
  db?: CandidateDb;
};

export type PersistCandidateResult = {
  candidateId: string;
  created: boolean;
  /** 실제 내용 변경이 감지되어 candidate를 갱신했는지 */
  contentChanged: boolean;
  rawHtmlSnippetId: string | null;
  reviewPending: boolean;
  isDuplicate: boolean;
  duplicateGroupId: string | null;
};

export async function getDefaultDb(): Promise<CandidateDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as CandidateDb;
}

export async function persistCandidateQuestion(
  request: PersistCandidateRequest,
  deps: PersistCandidateDeps = {},
): Promise<PersistCandidateResult> {
  const storage = deps.storage ?? createSnippetStorage(CBT_SNIPPETS_DIR);
  const db = deps.db ?? (await getDefaultDb());
  const { question, rawHtmlSnippet } = request;

  let rawHtmlSnippetId: string | null = null;
  if (rawHtmlSnippet !== null && rawHtmlSnippet.trim() !== "") {
    const saved = await storage.save(rawHtmlSnippet);
    rawHtmlSnippetId = saved.id;
  }

  return db.$transaction(async (tx) => {
    const { id: candidateId, created, contentChanged, previousFingerprint } =
      await upsertCandidateQuestion(tx, question, rawHtmlSnippetId);
    const review = await upsertReviewForValidationStatus(
      tx,
      candidateId,
      question,
      contentChanged,
    );
    const duplicate = await registerDuplicateIfNeeded(
      tx,
      candidateId,
      question.contentFingerprint,
      previousFingerprint,
    );
    return {
      candidateId,
      created,
      contentChanged,
      rawHtmlSnippetId,
      reviewPending: review !== null && review.reviewStatus === "PENDING",
      isDuplicate: duplicate.isDuplicate,
      duplicateGroupId: duplicate.groupId,
    };
  });
}
