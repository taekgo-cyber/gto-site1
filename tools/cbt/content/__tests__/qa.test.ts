import { describe, expect, it } from "vitest";
import { runAutoQa } from "../qa";
import { MockLlmProvider } from "../provider/mock";
import { MOCK_GENERATED_QUESTION } from "../provider";
import type { CandidateContent, GeneratedContent } from "../types";
import { fullCriteria } from "./helpers";
import type { QaLlmOutput } from "../schemas";

const candidate: CandidateContent = {
  id: "cq-1",
  category: "CAT-HANDLING",
  questionText: "화물 적재 시 무게 중심을 낮추면 안전하다.",
  choices: [
    { index: 1, text: "연비 향상" },
    { index: 2, text: "전복 사고 예방" },
    { index: 3, text: "적재량 증가" },
    { index: 4, text: "하역 속도 향상" },
  ],
  normalizedAnswers: [2],
  explanation: "무게 중심이 낮으면 전복 위험이 줄어든다.",
};

const content: GeneratedContent = {
  questionText: MOCK_GENERATED_QUESTION.questionText,
  choices: MOCK_GENERATED_QUESTION.choices.map((c, i) => ({ index: i + 1, text: c.text })),
  answers: MOCK_GENERATED_QUESTION.answers,
  explanation: MOCK_GENERATED_QUESTION.explanation,
  category: MOCK_GENERATED_QUESTION.category,
  difficulty: MOCK_GENERATED_QUESTION.difficulty,
  factSourceMapping: MOCK_GENERATED_QUESTION.factSourceMapping,
};

describe("AI Auto-QA (STEP 8 §14)", () => {
  it("pass=true, 결함 없음 → ok + evaluation.pass", async () => {
    const provider = new MockLlmProvider({
      kind: "normal",
      data: {
        criteria: fullCriteria(),
        hasHallucination: false,
        isCopyrightSafe: true,
        criticalFlaws: [],
        pass: true,
      },
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluation.pass).toBe(true);
      expect(result.evaluation.hasHallucination).toBe(false);
      expect(result.promptVersion).toBe("step8-auto-qa-v1");
    }
  });

  it("AI가 pass=true여도 hallucination이면 강제 pass=false", async () => {
    const provider = new MockLlmProvider({
      kind: "normal",
      data: {
        criteria: fullCriteria(),
        hasHallucination: true,
        isCopyrightSafe: false,
        criticalFlaws: ["환각"],
        pass: true,
      },
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.pass).toBe(false);
  });

  it("criticalFlaws가 있으면 pass=false", async () => {
    const provider = new MockLlmProvider({
      kind: "normal",
      data: {
        criteria: fullCriteria(),
        hasHallucination: false,
        isCopyrightSafe: false,
        criticalFlaws: ["정답 오류"],
        pass: true,
      },
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluation.pass).toBe(false);
      expect(result.evaluation.criticalFlaws).toContain("정답 오류");
    }
  });

  it("LLM 실패(timeout) → ok:false (No Drop 처리 대상)", async () => {
    const provider = new MockLlmProvider({ kind: "timeout", delayMs: 1 });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("timeout");
  });

  it("QA 스키마 불일치(기준 누락) → ok:false schema_validation_failed", async () => {
    const { fact_accuracy, ...rest } = fullCriteria();
    void fact_accuracy;
    const provider = new MockLlmProvider({
      kind: "normal",
      data: {
        criteria: rest,
        hasHallucination: false,
        isCopyrightSafe: true,
        criticalFlaws: [],
        pass: true,
      } as unknown as QaLlmOutput,
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("schema_validation_failed");
  });
});
