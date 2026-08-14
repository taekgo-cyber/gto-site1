// STEP 5 — LLM fallback adapter/interface + guardrail (Session 10-1 STEP 5 §14/§15/§16).
//
// 현재 프로젝트에는 외부 LLM client abstraction이 아직 없다 (config.ts에 CBT_LLM_* 설정만 존재).
// 따라서 실제 외부 LLM 호출을 강제로 구현하지 않고, adapter interface + 결과 guardrail만 제공한다.
// 실제 client 구현은 LLM 기반이 확정되는 시점에 진행한다 (config.ts의
// CBT_LLM_PROVIDER/CBT_LLM_BASE_URL/CBT_LLM_API_KEY/CBT_LLM_MODEL 참고, OpenAI-compatible).
//
// 핵심 원칙:
//  - LLM은 "정답을 맞히는 AI"가 아니라 "명시된 원문을 제한된 schema로 구조화하는 보조 parser".
//  - 정답을 추론한 결과(rawAnswerText가 없는 입력에 답을 뱉은 경우)는 절대 수용하지 않는다.
//  - 결과는 반드시 guardrail(범위/schema)을 통과해야 한다. 실패 시 REVIEW_REQUIRED로 처리.
//  - confidence가 높아도 VALID로 만들지 않는다 (최종 판정은 deterministic rule).

import type { NormalizedCategoryCode } from "../types";
import { NORMALIZED_CATEGORY_CODES } from "../types";

/** LLM answer 정규화 결과 (원문에 명시된 정답의 구조화 전용) */
export type AnswerParseLlmResult = {
  answers: number[];
  confidence: number;
};

/** LLM category 분류 결과 */
export type CategoryLlmResult = {
  category: NormalizedCategoryCode;
  confidence: number;
};

/** 외부 LLM 호출 adapter 인터페이스. 실제 구현은 LLM STEP에서 제공한다 */
export interface AnswerNormalizeLlmAdapter {
  normalizeAnswer(rawAnswerText: string): Promise<AnswerParseLlmResult>;
}

export interface CategoryLlmAdapter {
  classifyCategory(
    questionText: string,
    choiceTexts: string[],
  ): Promise<CategoryLlmResult>;
}

export type LlmAnswerValidation =
  | { ok: true; answers: number[] }
  | { ok: false; reason: string };

/**
 * answer 정규화 결과 guardrail.
 * - 원문에 정답 표기가 없는데 LLM이 answer를 반환하면 거부 (정답 추론 금지)
 * - 빈 배열 / 숫자 아님 / 보기 범위 초과 → 거부
 * - confidence는 판정에 사용하지 않는다
 */
export function validateAnswerLlmResult(
  result: AnswerParseLlmResult,
  context: { choiceCount: number; rawAnswerText: string | null },
): LlmAnswerValidation {
  if (context.rawAnswerText === null || context.rawAnswerText.trim().length === 0) {
    return { ok: false, reason: "answer_source_missing" };
  }

  if (result === null || typeof result !== "object") {
    return { ok: false, reason: "malformed_response" };
  }

  if (!Array.isArray(result.answers) || result.answers.length === 0) {
    return { ok: false, reason: "answer_empty_or_malformed" };
  }

  for (const answer of result.answers) {
    if (!Number.isInteger(answer) || answer < 1 || answer > context.choiceCount) {
      return { ok: false, reason: `answer_out_of_range (${answer})` };
    }
  }

  return { ok: true, answers: [...new Set(result.answers)] };
}

export type LlmCategoryValidation =
  | { ok: true; category: NormalizedCategoryCode }
  | { ok: false; reason: string };

/**
 * category 분류 결과 guardrail.
 * - 허용 카테고리(4개 + UNKNOWN) 외 반환 → 거부 (새 category 생성 금지)
 * - 타입/형식 오류(malformed) → 거부
 */
export function validateCategoryLlmResult(
  result: CategoryLlmResult,
): LlmCategoryValidation {
  if (result === null || typeof result !== "object") {
    return { ok: false, reason: "malformed_response" };
  }

  const code: unknown = result.category;
  if (
    typeof code !== "string" ||
    !(NORMALIZED_CATEGORY_CODES as readonly string[]).includes(code)
  ) {
    return { ok: false, reason: "category_not_allowed" };
  }

  return { ok: true, category: code as NormalizedCategoryCode };
}

// TODO(STEP 6+): CBT_LLM_* 환경변수(config.ts)를 사용하는 OpenAI-compatible
// chat completions 기반 실제 adapter 구현. 추가 SDK 도입 전 사용자와 협의.
