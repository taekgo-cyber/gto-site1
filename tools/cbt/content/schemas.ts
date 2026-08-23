// STEP 8 — zod 스키마 + prompt version 상수.
// LLM 출력을 구조화하는 데 사용한다 (STEP 8 §8/§11/§14).
import { z } from "zod";
import { CBT_CATEGORY_CODES } from "../types";
import {
  DIFFICULTIES,
  FACT_IMPORTANCES,
  FACT_SOURCE_USAGES,
} from "./types";

// ---------------------------------------------------------------------------
// prompt version (provenance 추적용). 변경 시 반드시 증가/이름 변경한다.
// ---------------------------------------------------------------------------

export const FACT_EXTRACTION_PROMPT_VERSION = "step8-fact-extract-v1";
export const QUESTION_GENERATION_PROMPT_VERSION = "step8-question-gen-v1.1";
export const AUTO_QA_PROMPT_VERSION = "step8-auto-qa-v3.1";

// ---------------------------------------------------------------------------
// Fact Extraction 스키마 (STEP 8 §10)
// ---------------------------------------------------------------------------

export const FACT_EXTRACTION_SCHEMA = z.object({
  facts: z
    .array(
      z.object({
        statement: z.string().min(1),
        importance: z.enum(FACT_IMPORTANCES),
      }),
    )
    .min(1),
  correctAnswerBasis: z.string().min(1),
  constraints: z.array(z.string()),
});

export type FactExtractionLlmOutput = z.infer<typeof FACT_EXTRACTION_SCHEMA>;

// ---------------------------------------------------------------------------
// Question Generation 스키마 (STEP 8 §11)
// choices는 index 없이 text만 내려오고, index(1..n)는 서버가 부여한다.
// ---------------------------------------------------------------------------

export const GENERATED_QUESTION_SCHEMA = z.object({
  questionText: z.string().min(1),
  choices: z.array(z.object({ text: z.string().min(1) })).min(4).max(4),
  answers: z.array(z.number().int().min(1).max(4)).min(1),
  explanation: z.string().min(1),
  category: z.enum(CBT_CATEGORY_CODES),
  difficulty: z.enum(DIFFICULTIES),
  factSourceMapping: z
    .array(
      z.object({
        statement: z.string().min(1),
        usedAs: z.enum(FACT_SOURCE_USAGES),
      }),
    )
    .min(1),
});

export type GeneratedQuestionLlmOutput = z.infer<
  typeof GENERATED_QUESTION_SCHEMA
>;

// ---------------------------------------------------------------------------
// Auto-QA 스키마 (STEP 8 §14)
// criteria는 11개 키를 모두 요구하는 strict object로 강제한다.
// ---------------------------------------------------------------------------

function qaCriteriaEntrySchema() {
  return z.object({
    score: z.number().min(1).max(5),
    note: z.string().nullable(),
  });
}

const QA_CRITERIA_SCHEMA = z.object({
  fact_accuracy: qaCriteriaEntrySchema(),
  answer_accuracy: qaCriteriaEntrySchema(),
  single_answer: qaCriteriaEntrySchema(),
  option_plausibility: qaCriteriaEntrySchema(),
  question_clarity: qaCriteriaEntrySchema(),
  ambiguity: qaCriteriaEntrySchema(),
  explanation_accuracy: qaCriteriaEntrySchema(),
  hallucination: qaCriteriaEntrySchema(),
  fact_source_consistency: qaCriteriaEntrySchema(),
  duplicate_risk: qaCriteriaEntrySchema(),
  expression_quality: qaCriteriaEntrySchema(),
});

export const QA_SCHEMA = z.object({
  criteria: QA_CRITERIA_SCHEMA,
  hasHallucination: z.boolean(),
  isCopyrightSafe: z.boolean(),
  criticalFlaws: z.array(z.string()),
  pass: z.boolean(),
});

export type QaLlmOutput = z.infer<typeof QA_SCHEMA>;
