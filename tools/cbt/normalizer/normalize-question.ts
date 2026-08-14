// STEP 5 — NormalizeQuestion 오케스트레이션 (Session 10-1 STEP 5 §6/§7/§18/§20/§21).
// ExtractedQuestion 1건 → NormalizedQuestion 1건. multi-question HTML은 map으로 처리한다.
//
// 핵심 원칙:
//  - 원문(questionText/choices/explanation/images)을 수정하지 않고 pass-through.
//  - 정답 추론 금지: rawAnswerText가 없으면 normalizedAnswers = [] + REVIEW_REQUIRED.
//  - No Drop: 검증 실패 데이터도 결과로 보존한다. question identity 자체가 없을 때만 REJECTED.
//  - provenance: sourceName/sourceQuestionId/rawHtmlSnippet(ref)를 그대로 유지.
//  - 입력된 ExtractedQuestion은 절대 변경하지 않는다.
//  - 카테고리/정답의 LLM 결과는 호출 전 guardrail(llm.ts)을 통과한 것만 주입한다.

import type {
  ExtractedQuestion,
  NormalizedCategoryCode,
  NormalizedQuestion,
  ValidationStatus,
  ExplanationReference,
} from "../types";
import { parseAnswerText } from "./answer-normalize";
import { validateAnswer, validateChoices, isQuestionTextMissing } from "./validate-question";
import { classifyCategory, resolveSourceCategory } from "./classify-category";
import { createContentFingerprint } from "./fingerprint";

export type NormalizeQuestionOptions = {
  /** 소스 기본 카테고리. 미제공 시 resolveSourceCategory(sourceName)로 조회 */
  sourceCategory?: NormalizedCategoryCode | null;
  /** rule로 정답 미해석 시 사용할 LLM 결과 (사전 guardrail 검증 필수) */
  llmAnswer?: { answers: number[]; confidence?: number } | null;
  /** rule로 카테고리 미분류 시 사용할 LLM 결과 (사전 guardrail 검증 필수) */
  llmCategory?: { category: NormalizedCategoryCode; confidence?: number } | null;
};

/**
 * 해설에 다른 문제 참조 문구가 있는지 탐지한다.
 * 실제 FK 연결은 하지 않고 metadata만 생성한다.
 */
export function detectExplanationReference(
  explanation: string | null,
): ExplanationReference | null {
  if (explanation === null || explanation.trim().length === 0) return null;

  const numberMatch = explanation.match(/(\d{1,3})\s*번\s*(?:문제|해설)/);
  const relativeMatch = explanation.match(/(?:앞|이전|위|다음)\s*문제/);
  const genericMatch = explanation.match(/(?:참조|참고)/);

  if (!numberMatch && !relativeMatch && !genericMatch) return null;

  return {
    rawReferenceText: explanation,
    referencedQuestionNumber: numberMatch
      ? Number.parseInt(numberMatch[1], 10)
      : null,
  };
}

/**
 * ExtractedQuestion 1건을 검증/정규화하여 NormalizedQuestion 1건으로 만든다.
 * 순수 함수: 파일 쓰기/DB/네트워크 없음. 입력 불변.
 */
export function normalizeQuestion(
  question: ExtractedQuestion,
  options: NormalizeQuestionOptions = {},
): NormalizedQuestion {
  const validationErrors: string[] = [];

  // ------------------------------------------------------------------
  // REJECTED 판정 근거
  // ------------------------------------------------------------------
  const textMissing = isQuestionTextMissing(question.questionText);
  const identityRejected = question.extractionStatus === "failed" || textMissing;
  if (textMissing) validationErrors.push("question_text_missing");
  if (question.extractionStatus === "failed") validationErrors.push("extraction_failed");

  // ------------------------------------------------------------------
  // choices 검증 (identity 부재 시 불필요한 노이즈 억제)
  // ------------------------------------------------------------------
  if (!identityRejected) {
    validationErrors.push(
      ...validateChoices(question.choices, question.images).errors,
    );
  }

  // ------------------------------------------------------------------
  // answer 정규화 + 검증
  // ------------------------------------------------------------------
  const parseResult = parseAnswerText(question.rawAnswerText);
  let normalizedAnswers = parseResult.answers;
  let llmUsedForAnswer = false;

  if (parseResult.status !== "parsed" && options.llmAnswer) {
    normalizedAnswers = options.llmAnswer.answers;
    llmUsedForAnswer = true;
  }

  validationErrors.push(
    ...validateAnswer(
      normalizedAnswers,
      question.rawAnswerText,
      question.choices.length,
    ).errors,
  );

  // ------------------------------------------------------------------
  // category classification
  // ------------------------------------------------------------------
  const sourceCategory =
    options.sourceCategory ?? resolveSourceCategory(question.sourceName) ?? null;
  const classificationText = [
    question.questionText,
    ...question.choices.map((choice) => choice.text),
  ].join("\n");

  const { category: initialCategory, method: initialMethod } = classifyCategory({
    sourceCategory,
    text: classificationText,
  });

  let category = initialCategory;
  let classificationMethod: import("../types").ClassificationMethod = initialMethod;
  let llmUsedForCategory = false;

  if (category === "UNKNOWN" && classificationMethod !== "source") {
    if (options.llmCategory) {
      category = options.llmCategory.category;
      classificationMethod = "llm";
      llmUsedForCategory = true;
    }
  }

  if (category === "UNKNOWN") {
    validationErrors.push("category_unclassified");
  }

  // ------------------------------------------------------------------
  // explanation reference
  // ------------------------------------------------------------------
  const explanationReference = detectExplanationReference(question.explanation);
  if (explanationReference) {
    validationErrors.push("explanation_reference");
  }

  // ------------------------------------------------------------------
  // validationStatus 결정 (deterministic rule)
  // ------------------------------------------------------------------
  let validationStatus: ValidationStatus;
  if (identityRejected) {
    validationStatus = "REJECTED";
  } else {
    validationStatus =
      validationErrors.length > 0 ? "REVIEW_REQUIRED" : "VALID";
  }

  // ------------------------------------------------------------------
  // fingerprint + llm metadata
  // ------------------------------------------------------------------
  const contentFingerprint = createContentFingerprint(
    question.questionText,
    question.choices,
  );

  let llmMetadata: NormalizedQuestion["llmMetadata"];
  if (llmUsedForAnswer || llmUsedForCategory) {
    llmMetadata = {
      usedFor: [
        ...(llmUsedForAnswer ? ["normalization" as const] : []),
        ...(llmUsedForCategory ? ["classification" as const] : []),
      ],
      confidenceScore:
        options.llmAnswer?.confidence ?? options.llmCategory?.confidence,
    };
  }

  return {
    sourceRef: {
      sourceName: question.sourceRef.sourceName,
      sourceQuestionId: question.sourceRef.sourceQuestionId,
      originalUrl: question.sourceRef.originalUrl,
      fetchedAt: question.sourceRef.fetchedAt,
      rawSourceFile: question.sourceRef.rawSourceFile,
      rawBlockId: question.sourceRef.rawBlockId,
      contentHash: question.sourceRef.contentHash,
      // rawHtmlSnippet은 입력 ExtractedQuestion에 그대로 보존된다.
      // snippet 저장/ID 부여는 STEP 6의 책임.
      rawHtmlSnippetId: null,
    },
    category,
    classificationMethod,
    questionNumber: question.questionNumber,
    questionText: question.questionText,
    choices: question.choices,
    normalizedAnswers,
    explanation: question.explanation,
    explanationReference,
    images: question.images,
    validationStatus,
    validationErrors,
    contentFingerprint,
    ...(llmMetadata ? { llmMetadata } : {}),
  };
}