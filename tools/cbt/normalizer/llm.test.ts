import { describe, expect, it } from "vitest";
import {
  validateAnswerLlmResult,
  validateCategoryLlmResult,
} from "./llm";
import type { AnswerNormalizeLlmAdapter } from "./llm";

const answerContext = { choiceCount: 4, rawAnswerText: "정답: ③" };

describe("validateAnswerLlmResult", () => {
  it("39. 정상 answer 구조화 → 수용", () => {
    const result = validateAnswerLlmResult(
      { answers: [3], confidence: 0.95 },
      answerContext,
    );
    expect(result).toEqual({ ok: true, answers: [3] });
  });

  it("39. 복수 정답 구조화 → 수용", () => {
    const result = validateAnswerLlmResult(
      { answers: [1, 3], confidence: 0.8 },
      answerContext,
    );
    expect(result).toEqual({ ok: true, answers: [1, 3] });
  });

  it("confidence는 수용 판정에 영향이 없다", () => {
    const low = validateAnswerLlmResult(
      { answers: [3], confidence: 0.1 },
      answerContext,
    );
    expect(low.ok).toBe(true);
  });

  it("41. answer 범위 초과(5, 보기 4개) → 거부", () => {
    const result = validateAnswerLlmResult(
      { answers: [5], confidence: 0.99 },
      answerContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("answer_out_of_range");
  });

  it("42. malformed(answers가 숫자 배열 아님) → 거부", () => {
    const result = validateAnswerLlmResult(
      { answers: "three" as unknown as number[], confidence: 0.5 },
      answerContext,
    );
    expect(result.ok).toBe(false);
  });

  it("42. 빈 answers → 거부", () => {
    const result = validateAnswerLlmResult(
      { answers: [], confidence: 0.5 },
      answerContext,
    );
    expect(result.ok).toBe(false);
  });

  it("43. 원문에 정답이 없는데 답을 추론한 response → 거부", () => {
    const result = validateAnswerLlmResult(
      { answers: [2], confidence: 0.9 },
      { choiceCount: 4, rawAnswerText: null },
    );
    expect(result).toEqual({ ok: false, reason: "answer_source_missing" });
  });

  it("mock adapter가 정상 결과를 반환하면 guardrail을 통과한다", async () => {
    const adapter: AnswerNormalizeLlmAdapter = {
      async normalizeAnswer() {
        return { answers: [3], confidence: 0.9 };
      },
    };
    const llmResult = await adapter.normalizeAnswer("정답: ③");
    expect(validateAnswerLlmResult(llmResult, answerContext).ok).toBe(true);
  });
});

describe("validateCategoryLlmResult", () => {
  it("허용 category → 수용", () => {
    const result = validateCategoryLlmResult({ category: "CAT-SAFETY", confidence: 0.8 });
    expect(result).toEqual({ ok: true, category: "CAT-SAFETY" });
  });

  it("UNKNOWN 반환도 허용된다", () => {
    expect(validateCategoryLlmResult({ category: "UNKNOWN", confidence: 0.4 }).ok).toBe(
      true,
    );
  });

  it("40. 허용되지 않은 category → 거부 (새 category 생성 금지)", () => {
    const result = validateCategoryLlmResult({
      category: "CAT-MADE-UP" as never,
      confidence: 0.9,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("category_not_allowed");
  });

  it("42. malformed(객체 아님) → 거부", () => {
    expect(
      validateCategoryLlmResult(undefined as unknown as never),
    ).toMatchObject({ ok: false });
  });

  it("42. category 누락 → 거부", () => {
    expect(
      validateCategoryLlmResult({ confidence: 0.9 } as never),
    ).toMatchObject({ ok: false });
  });
});
