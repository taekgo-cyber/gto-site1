// STEP 8 — 생성 콘텐츠 semantic 검증 (STEP 8 §11).
// zod(shape) 이후의 의미 검증: 4지선다 / 정답 index 유효성 / 복수 정답 / 필수 필드 / 카테고리 / 난이도.
import { CBT_CATEGORY_CODES } from "../types";
import { DIFFICULTIES } from "./types";
import type { GeneratedContent } from "./types";
import type { GeneratedQuestionLlmOutput } from "./schemas";

export type ContentAssessment =
  | { ok: true; content: GeneratedContent }
  | { ok: false; errors: string[] };

/**
 * LLM 출력(GENERATED_QUESTION_SCHEMA 통과본)에 대해 의미 검증을 수행한다.
 * index(1..4) 부여 + 정답 범위/중복 검사 + 필수 요소 검사.
 */
export function assessGeneratedContent(
  raw: GeneratedQuestionLlmOutput,
): ContentAssessment {
  const errors: string[] = [];

  const questionText = raw.questionText.trim();
  if (questionText.length === 0) {
    errors.push("questionText_missing");
  }

  if (raw.choices.length !== 4) {
    errors.push(`choices_count_invalid (${raw.choices.length})`);
  }
  const choiceTexts = raw.choices.map((c) => c.text.trim());
  if (choiceTexts.some((text) => text.length === 0)) {
    errors.push("choice_text_missing");
  }
  const choices = raw.choices.map((c, i) => ({
    index: i + 1,
    text: c.text.trim(),
  }));

  if (raw.answers.length === 0) {
    errors.push("answers_empty");
  }
  const answers = [...new Set(raw.answers)];
  if (answers.some((a) => a < 1 || a > 4)) {
    errors.push("answer_out_of_range");
  }
  if (answers.length !== raw.answers.length) {
    errors.push("duplicate_answers");
  }
  if (answers.length !== 1) {
    errors.push("single_answer_required");
  }

  if (raw.explanation.trim().length === 0) {
    errors.push("explanation_missing");
  }

  if (!(CBT_CATEGORY_CODES as readonly string[]).includes(raw.category)) {
    errors.push(`category_invalid (${raw.category})`);
  }

  if (!(DIFFICULTIES as readonly string[]).includes(raw.difficulty)) {
    errors.push(`difficulty_invalid (${raw.difficulty})`);
  }

  if (raw.factSourceMapping.length === 0) {
    errors.push("fact_source_mapping_missing");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    content: {
      questionText,
      choices,
      answers,
      explanation: raw.explanation.trim(),
      category: raw.category,
      difficulty: raw.difficulty,
      factSourceMapping: raw.factSourceMapping.map((entry) => ({
        statement: entry.statement.trim(),
        usedAs: entry.usedAs,
      })),
    },
  };
}
