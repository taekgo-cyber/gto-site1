// STEP 8 — 테스트 공용 헬퍼
import type { QaCriteriaKey, QaCriteriaEntry } from "../types";
import type { QaLlmOutput } from "../schemas";

export function fullCriteria(): Record<QaCriteriaKey, QaCriteriaEntry> {
  return {
    fact_accuracy: { score: 5, note: null },
    answer_accuracy: { score: 5, note: null },
    single_answer: { score: 5, note: null },
    option_plausibility: { score: 5, note: null },
    question_clarity: { score: 5, note: null },
    ambiguity: { score: 5, note: null },
    explanation_accuracy: { score: 5, note: null },
    hallucination: { score: 5, note: null },
    fact_source_consistency: { score: 5, note: null },
    duplicate_risk: { score: 5, note: null },
    expression_quality: { score: 5, note: null },
  };
}

export function qaPassPayload(): QaLlmOutput {
  return {
    criteria: fullCriteria(),
    hasHallucination: false,
    isCopyrightSafe: true,
    criticalFlaws: [],
    pass: true,
  };
}
