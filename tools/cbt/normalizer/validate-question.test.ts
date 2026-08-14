import { describe, expect, it } from "vitest";
import {
  EXPECTED_CHOICE_COUNT,
  isQuestionTextMissing,
  validateAnswer,
  validateChoices,
} from "./validate-question";
import type { ExtractedChoice, ExtractedImageAsset } from "../types";

function choices(indexes: number[], texts?: string[]): ExtractedChoice[] {
  return indexes.map((index, i) => ({ index, text: texts?.[i] ?? `보기${index}` }));
}

const NORMAL_4 = choices([1, 2, 3, 4]);

describe("validateChoices", () => {
  it("11. 정상 4개 보기 → 에러 없음", () => {
    expect(validateChoices(NORMAL_4).errors).toEqual([]);
  });

  it("12. 3개 보기 → 개수 사유 기록, 데이터는 보존", () => {
    const result = validateChoices(choices([1, 2, 3]));
    expect(result.errors.some((e) => e.startsWith("choices_count_not_four"))).toBe(true);
  });

  it("13. 빈 보기 → choices_missing", () => {
    expect(validateChoices([]).errors).toContain("choices_missing");
  });

  it("14. 중복 index → choices_index_duplicate", () => {
    const result = validateChoices(choices([1, 1, 2, 3]));
    expect(result.errors).toContain("choices_index_duplicate");
  });

  it("15. 비연속 index → choices_index_not_continuous", () => {
    const result = validateChoices(choices([1, 2, 4, 5]));
    expect(result.errors).toContain("choices_index_not_continuous");
  });

  it("16. index가 0부터 시작 → choices_index_not_start_at_one", () => {
    const result = validateChoices(choices([0, 1, 2, 3]));
    expect(result.errors).toContain("choices_index_not_start_at_one");
  });

  it("17. 빈 choice text → choice_text_empty", () => {
    const result = validateChoices(choices([1, 2, 3, 4], ["a", "", "c", "d"]));
    expect(result.errors).toContain("choice_text_empty");
  });

  it("18. 이미지 전용 choice(텍스트 없음 + 이미지) → 정상", () => {
    const images: ExtractedImageAsset[] = [
      {
        src: "/images/opt1.png",
        alt: null,
        index: 0,
        location: "choice_1",
        sourceUrl: null,
        originalSrc: "/images/opt1.png",
        resolvedSrc: null,
        width: null,
        height: null,
      },
    ];
    const result = validateChoices(
      choices([1, 2, 3, 4], ["", "나", "다", "라"]),
      images,
    );
    expect(result.errors).not.toContain("choice_text_empty");
  });
});

describe("validateAnswer", () => {
  it("정상 단일 정답 → 에러 없음", () => {
    expect(validateAnswer([3], "정답: ③", 4).errors).toEqual([]);
  });

  it("복수 정답이 보기 범위 내 → 에러 없음", () => {
    expect(validateAnswer([1, 3], "정답: 1, 3", 4).errors).toEqual([]);
  });

  it("정답이 보기 범위를 벗어남([5], 4개 보기) → answer_out_of_range", () => {
    const result = validateAnswer([5], "정답: ⑤", 4);
    expect(result.errors.some((e) => e.startsWith("answer_out_of_range"))).toBe(true);
  });

  it("[0] → answer_out_of_range", () => {
    const result = validateAnswer([0], "정답: 0", 4);
    expect(result.errors.some((e) => e.startsWith("answer_out_of_range"))).toBe(true);
  });

  it("정답 없음(raw null) → answer_missing (추론 금지)", () => {
    expect(validateAnswer([], null, 4).errors).toContain("answer_missing");
  });

  it("원문은 있으나 파싱 불가 → answer_unparseable", () => {
    expect(validateAnswer([], "③ 또는 ④", 4).errors).toContain("answer_unparseable");
  });
});

describe("isQuestionTextMissing", () => {
  it("빈/공백 텍스트 → true", () => {
    expect(isQuestionTextMissing("")).toBe(true);
    expect(isQuestionTextMissing("   ")).toBe(true);
  });

  it("정상 텍스트 → false", () => {
    expect(isQuestionTextMissing("문제입니다")).toBe(false);
  });

  it("기대 보기 수는 4지선다", () => {
    expect(EXPECTED_CHOICE_COUNT).toBe(4);
  });
});
