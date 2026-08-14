// STEP 6 — CandidateQuestion 영속 저장 (Session 10-1 STEP 6 §26, STEP 6.1 §7/§8).
// sourceName + sourceQuestionId 복합 unique로 idempotent하게 저장한다.
// - 동일 내용 재실행: 기존 레코드·review 상태를 그대로 보존한다.
// - 실제 내용 변경(contentFingerprint/questionText/choices/normalizedAnswers/explanation):
//   최신 내용으로 갱신하고 contentChanged=true를 보고해 review 재검토를 유도한다.
// 삭제/덮어쓰기 금지(변경은 갱신일 뿐 이전 raw 데이터는 snippet/raw 파일로 보존).

import type {
  CandidateQuestion,
  Prisma,
} from "@/generated/prisma/client";
import type { NormalizedQuestion, ValidationStatus } from "../types";

/** STEP 6에서 사용하는 Prisma delegate/트랜잭션의 최소 인터페이스 */
export type CandidateDb = {
  candidateQuestion: {
    findUnique(
      args: Prisma.CandidateQuestionFindUniqueArgs,
    ): Promise<CandidateQuestion | null>;
    findFirst(
      args: Prisma.CandidateQuestionFindFirstArgs,
    ): Promise<CandidateQuestion | null>;
    create(
      args: Prisma.CandidateQuestionCreateArgs,
    ): Promise<CandidateQuestion>;
    update(
      args: Prisma.CandidateQuestionUpdateArgs,
    ): Promise<CandidateQuestion>;
  };
  candidateReview: {
    findUnique(
      args: Prisma.CandidateReviewFindUniqueArgs,
    ): Promise<CandidateReviewLike | null>;
    create(
      args: Prisma.CandidateReviewCreateArgs,
    ): Promise<CandidateReviewLike>;
    update(
      args: Prisma.CandidateReviewUpdateArgs,
    ): Promise<CandidateReviewLike>;
  };
  candidateDuplicateGroup: {
    findUnique(
      args: Prisma.CandidateDuplicateGroupFindUniqueArgs,
    ): Promise<CandidateDuplicateGroupLike | null>;
    findMany(
      args: Prisma.CandidateDuplicateGroupFindManyArgs,
    ): Promise<CandidateDuplicateGroupLike[]>;
    create(
      args: Prisma.CandidateDuplicateGroupCreateArgs,
    ): Promise<CandidateDuplicateGroupLike>;
    delete(
      args: Prisma.CandidateDuplicateGroupDeleteArgs,
    ): Promise<CandidateDuplicateGroupLike>;
  };
  candidateDuplicateMember: {
    createMany(
      args: Prisma.CandidateDuplicateMemberCreateManyArgs,
    ): Promise<Prisma.BatchPayload>;
    deleteMany(
      args: Prisma.CandidateDuplicateMemberDeleteManyArgs,
    ): Promise<Prisma.BatchPayload>;
    count(
      args: Prisma.CandidateDuplicateMemberCountArgs,
    ): Promise<number>;
  };
  $transaction: <R>(fn: (tx: CandidateDb) => Promise<R>) => Promise<R>;
};

type CandidateReviewLike = {
  id: string;
  candidateQuestionId: string;
  reviewStatus: string;
};

type CandidateDuplicateGroupLike = {
  id: string;
  fingerprint: string;
  isResolved: boolean;
  masterCandidateId: string | null;
};

/** create/update 양쪽에 공통으로 들어가는 후보 내용 + provenance 필드 */
type CandidateContentFields = {
  rawHtmlSnippetId: string | null;
  category: string;
  classificationMethod: string;
  questionNumber: number | null;
  questionText: string;
  choices: Prisma.InputJsonValue;
  normalizedAnswers: Prisma.InputJsonValue;
  explanation: string | null;
  explanationReference: Prisma.InputJsonValue;
  images: Prisma.InputJsonValue;
  validationStatus: ValidationStatus;
  validationErrors: Prisma.InputJsonValue;
  contentFingerprint: string;
  originalUrl: string | null;
  fetchedAt: string | Date | null;
};

/** review 판정에 쓰이는 내용 필드 (STEP 6.1 §8) */
export const CONTENT_SIGNATURE_FIELDS = [
  "contentFingerprint",
  "questionText",
  "choices",
  "normalizedAnswers",
  "explanation",
] as const;

function buildCandidateContentFields(
  normalized: NormalizedQuestion,
  rawHtmlSnippetId: string | null,
): CandidateContentFields {
  return {
    rawHtmlSnippetId,
    category: normalized.category,
    classificationMethod: normalized.classificationMethod,
    questionNumber: normalized.questionNumber,
    questionText: normalized.questionText,
    choices: normalized.choices as unknown as Prisma.InputJsonValue,
    normalizedAnswers:
      normalized.normalizedAnswers as unknown as Prisma.InputJsonValue,
    explanation: normalized.explanation,
    explanationReference:
      normalized.explanationReference as unknown as Prisma.InputJsonValue,
    images: normalized.images as unknown as Prisma.InputJsonValue,
    validationStatus: normalized.validationStatus,
    validationErrors:
      normalized.validationErrors as unknown as Prisma.InputJsonValue,
    contentFingerprint: normalized.contentFingerprint,
    // Provenance 정책 (SESSION 10-2 STEP 6 hardening §3):
    // 동일 sourceName+sourceQuestionId 재수집 시 최신 originalUrl/fetchedAt으로
    // "최신 승(latest wins)" 정책을 적용한다. 이는 의도된 동작이며, 원본이
    // 완전히 사라지는 변경은 하지 않는다. 이전 원본은 raw HTML snippet과
    // raw 파일(rawSourceFile)로 계속 추적 가능하다.
    // TODO: 실제 다중 URL/versioning 요구가 발생하는 단계에서 별도
    // ProvenanceHistory 모델로 이전 값들을 보존한다 (이번 단계에서는 구현하지 않음).
    originalUrl: normalized.sourceRef.originalUrl,
    fetchedAt: normalized.sourceRef.fetchedAt,
  };
}

export function buildCandidateCreateInput(
  normalized: NormalizedQuestion,
  rawHtmlSnippetId: string | null,
): Prisma.CandidateQuestionCreateInput {
  return {
    sourceName: normalized.sourceRef.sourceName,
    sourceQuestionId: normalized.sourceRef.sourceQuestionId,
    ...buildCandidateContentFields(normalized, rawHtmlSnippetId),
  } as Prisma.CandidateQuestionCreateInput;
}

export function buildCandidateUpdateInput(
  normalized: NormalizedQuestion,
  rawHtmlSnippetId: string | null,
): Prisma.CandidateQuestionUpdateInput {
  return buildCandidateContentFields(
    normalized,
    rawHtmlSnippetId,
  ) as Prisma.CandidateQuestionUpdateInput;
}

export type CandidateQuestionRow = {
  id: string;
  created: boolean;
  /** 실제 내용 변경이 감지되어 candidate를 갱신했는지 */
  contentChanged: boolean;
  /** 갱신 전 candidate의 contentFingerprint. 신규 생성이면 null */
  previousFingerprint: string | null;
};

export function candidateUniqueWhere(
  sourceName: string,
  sourceQuestionId: string,
): Prisma.CandidateQuestionWhereUniqueInput {
  return {
    sourceName_sourceQuestionId: { sourceName, sourceQuestionId },
  };
}

/**
 * choices를 key 순서와 무관하게 비교한다.
 * Postgres JSONB는 객체 key를 알파벳순으로 재배열해 저장하므로
 * JSON.stringify 결과가 달라질 수 있다 (e.g. {index,text} → {text,index}).
 * 배열 순서(보기 순서)는 JSONB에도 유지되므로 index+text로 위치별 비교한다.
 */
function sameJsonChoices(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((choiceA, i) => {
    const choiceB = b[i];
    if (
      typeof choiceA !== "object" ||
      choiceA === null ||
      typeof choiceB !== "object" ||
      choiceB === null
    ) {
      return choiceA === choiceB;
    }
    const ca = choiceA as Record<string, unknown>;
    const cb = choiceB as Record<string, unknown>;
    return ca.index === cb.index && ca.text === cb.text;
  });
}

/**
 * 동일 sourceName+sourceQuestionId에 대해 review-relevant 내용이 실제로
 * 바뀌었는지 판단한다 (STEP 6.1 §8).
 * contentFingerprint/questionText/choices/normalizedAnswers/explanation 비교.
 */
export function hasContentChanged(
  existing: Pick<
    CandidateQuestion,
    (typeof CONTENT_SIGNATURE_FIELDS)[number]
  >,
  normalized: NormalizedQuestion,
): boolean {
  if (existing.contentFingerprint !== normalized.contentFingerprint) return true;
  if (existing.questionText !== normalized.questionText) return true;
  if (
    !sameJsonChoices(
      existing.choices,
      normalized.choices as unknown as Record<string, unknown>[],
    )
  ) {
    return true;
  }
  if (
    JSON.stringify(existing.normalizedAnswers) !==
    JSON.stringify(normalized.normalizedAnswers)
  ) {
    return true;
  }
  if (existing.explanation !== normalized.explanation) return true;
  return false;
}

/**
 * candidate를 생성 또는 갱신한다.
 * - 없으면 새로 만든다 (created=true).
 * - 있으면 실제 내용 변경 여부를 판단해, 변경된 경우에만 최신 내용으로 갱신한다.
 *   (변경 없으면 기존 레코드 그대로 — created=false, contentChanged=false)
 */
export async function upsertCandidateQuestion(
  db: CandidateDb,
  normalized: NormalizedQuestion,
  rawHtmlSnippetId: string | null,
): Promise<CandidateQuestionRow> {
  const where = candidateUniqueWhere(
    normalized.sourceRef.sourceName,
    normalized.sourceRef.sourceQuestionId,
  );
  const existing = await db.candidateQuestion.findUnique({ where });

  if (!existing) {
    const row = await db.candidateQuestion.create({
      data: buildCandidateCreateInput(normalized, rawHtmlSnippetId),
    });
    return {
      id: row.id,
      created: true,
      contentChanged: false,
      previousFingerprint: null,
    };
  }

  if (!hasContentChanged(existing, normalized)) {
    return {
      id: existing.id,
      created: false,
      contentChanged: false,
      previousFingerprint: existing.contentFingerprint,
    };
  }

  // 갱신 전 fingerprint를 미리 캡처한다 (update 후 읽으면 새 값을 읽을 수 있음)
  const previousFingerprint = existing.contentFingerprint;

  const updated = await db.candidateQuestion.update({
    where: { id: existing.id },
    data: buildCandidateUpdateInput(normalized, rawHtmlSnippetId),
  });
  return {
    id: updated.id,
    created: false,
    contentChanged: true,
    // 갱신 전 fingerprint → duplicate 그룹 stale 정리를 위해 전달한다.
    // (새 fingerprint는 normalized.contentFingerprint로 호출부가 안다)
    previousFingerprint,
  };
}
