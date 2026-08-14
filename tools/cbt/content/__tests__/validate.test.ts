import { describe, expect, it } from "vitest";
import { assessGeneratedContent } from "../validate";
import { MOCK_GENERATED_QUESTION } from "../provider";
import type { GeneratedQuestionLlmOutput } from "../schemas";

describe("assessGeneratedContent (STEP 8 §11 검증)", () => {
  it("정상 4지선다 → ok, index 1..4 부여", () => {
    const result = assessGeneratedContent(MOCK_GENERATED_QUESTION);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.choices).toHaveLength(4);
      expect(result.content.choices.map((c) => c.index)).toEqual([1, 2, 3, 4]);
      expect(result.content.answers).toEqual([2]);
    }
  });

  it("빈 questionText → 실패", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      questionText: "  ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("questionText_missing");
  });

  it("3지선다 → 실패 (choices_count_invalid)", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      choices: MOCK_GENERATED_QUESTION.choices.slice(0, 3),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("choices_count_invalid (3)");
  });

  it("복수 정답 → 실패 (single_answer_required + duplicate_answers)", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      answers: [1, 1, 2],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("duplicate_answers");
      expect(result.errors).toContain("single_answer_required");
    }
  });

  it("정답 index 범위 밖 → 실패 (answer_out_of_range)", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      answers: [5],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("answer_out_of_range");
  });

  it("explanation 없음 → 실패", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      explanation: " ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("explanation_missing");
  });

  it("category 불허 → 실패", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      category: "CAT-INVENTED" as GeneratedQuestionLlmOutput["category"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("category_invalid (CAT-INVENTED)");
  });

  it("difficulty 불허 → 실패", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      difficulty: "EXPERT" as GeneratedQuestionLlmOutput["difficulty"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("difficulty_invalid (EXPERT)");
  });

  it("factSourceMapping 없음 → 실패", () => {
    const result = assessGeneratedContent({
      ...MOCK_GENERATED_QUESTION,
      factSourceMapping: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("fact_source_mapping_missing");
  });
});
