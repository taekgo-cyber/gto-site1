// STEP 5 — 추출 데이터 검증 (Session 10-1 STEP 5 §10/§11/§12).
// 모두 결정론적 코드. 보기/정답/문제 필수 요소를 rule 기반으로 판정한다.
// 원칙: 검증 실패 데이터를 삭제하지 않고 validationErrors에 사유를 기록한다.

import type { ExtractedChoice, ExtractedImageAsset } from "../types";

/** Master Dataset 최종 정책: 4지선다. 개수가 다르면 사유를 기록하되 데이터는 보존한다 */
export const EXPECTED_CHOICE_COUNT = 4;

export type ChoicesValidation = {
  errors: string[];
};

/**
 * 보기 목록 검증.
 * - 존재/개수/index 중복/index 연속/index 1부터 시작/빈 텍스트(이미지 전용 예외)
 * - 개수가 4가 아니어도 데이터는 보존한다 (error만 기록)
 */
export function validateChoices(
  choices: readonly ExtractedChoice[],
  images: readonly ExtractedImageAsset[] = [],
): ChoicesValidation {
  const errors: string[] = [];

  if (choices.length === 0) {
    return { errors: ["choices_missing"] };
  }

  if (choices.length !== EXPECTED_CHOICE_COUNT) {
    errors.push(`choices_count_not_four (${choices.length})`);
  }

  const indexes = choices.map((choice) => choice.index);

  const seen = new Set<number>();
  for (const index of indexes) {
    if (seen.has(index)) {
      errors.push("choices_index_duplicate");
      break;
    }
    seen.add(index);
  }

  const sorted = [...indexes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (sorted[i + 1] !== sorted[i] + 1) {
      errors.push("choices_index_not_continuous");
      break;
    }
  }

  if (indexes.length > 0 && Math.min(...indexes) !== 1) {
    errors.push("choices_index_not_start_at_one");
  }

  // 이미지 전용 보기(텍스트 없음 + 해당 choice_ 위치에 이미지 존재)는 정상
  const imageChoiceIndexes = new Set<number>();
  for (const image of images) {
    if (image.location.startsWith("choice_")) {
      const n = Number.parseInt(image.location.slice("choice_".length), 10);
      if (Number.isInteger(n)) imageChoiceIndexes.add(n);
    }
  }

  for (const choice of choices) {
    if (choice.text.trim().length === 0 && !imageChoiceIndexes.has(choice.index)) {
      errors.push("choice_text_empty");
      break;
    }
  }

  return { errors };
}

export type AnswerValidation = {
  errors: string[];
};

/**
 * 정답 검증.
 * - 원문에 정답 표기가 없으면 answer_missing (추론 금지)
 * - 원문은 있으나 규칙으로 해석 불가 → answer_unparseable
 * - 정답 번호가 보기 범위를 벗어나면 answer_out_of_range
 */
export function validateAnswer(
  answers: readonly number[],
  rawAnswerText: string | null,
  choiceCount: number,
): AnswerValidation {
  const errors: string[] = [];

  if (rawAnswerText === null || rawAnswerText.trim().length === 0) {
    return { errors: ["answer_missing"] };
  }

  if (answers.length === 0) {
    return { errors: ["answer_unparseable"] };
  }

  for (const answer of answers) {
    if (!Number.isInteger(answer) || answer < 1 || answer > choiceCount) {
      errors.push(`answer_out_of_range (${answer})`);
      break;
    }
  }

  return { errors };
}

/** 문제 질문 텍스트가 없는지 여부. 없으면 REJECTED 판정 근거가 된다 */
export function isQuestionTextMissing(questionText: string): boolean {
  return questionText.trim().length === 0;
}
