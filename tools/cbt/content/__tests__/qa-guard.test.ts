// QA v3.1 mandatory/version guard 테스트.
// 1) version guard: 현재 QA 버전 상수는 고정되고("step8-auto-qa-v3.1"),
//    runAutoQa가 그 버전을 promptVersion으로 기록하는지 보장한다.
//    (프롬프트/스키마 변경은 반드시 버전을 올려야 한다 — schemas.test.ts와 연동)
// 2) mandatory guard: 11개 평가 기준은 모두 필수다. 하나라도 누락되면
//    schema_validation_failed로 통과할 수 없다 (QA는 결손을 허용하지 않는다).
// 3) pass gate(방어): hallucination/criticalFlaws가 있으면 AI가 pass=true를
//    반환해도 강제 pass=false가 되어 QA_PASSED로 승격되지 않는다.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAutoQa } from "../qa";
import { AUTO_QA_PROMPT_VERSION, QA_SCHEMA } from "../schemas";
import { MockLlmProvider, type MockBehavior } from "../provider/mock";
import { MOCK_GENERATED_QUESTION } from "../provider";
import type { CandidateContent, GeneratedContent } from "../types";
import { fullCriteria, qaPassPayload } from "./helpers";

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

/** QA_SCHEMA 기준 지형을 그대로 노출하는 필수 키 목록 */
const MANDATORY_CRITERIA_KEYS = [
  "fact_accuracy",
  "answer_accuracy",
  "single_answer",
  "option_plausibility",
  "question_clarity",
  "ambiguity",
  "explanation_accuracy",
  "hallucination",
  "fact_source_consistency",
  "duplicate_risk",
  "expression_quality",
] as const;

describe("QA v3.1 version guard", () => {
  it("현재 판매용 QA 버전 상수는 step8-auto-qa-v3.1 로 고정된다", () => {
    expect(AUTO_QA_PROMPT_VERSION).toBe("step8-auto-qa-v3.1");
  });

  it("runAutoQa 성공 결과는 현재 QA 버전을 promptVersion으로 기록한다", async () => {
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.promptVersion).toBe(AUTO_QA_PROMPT_VERSION);
  });

  it("QA_SCHEMA는 좁히지 않고 11개 필수 기준을 하나의 strict object로 강제한다", () => {
    const schemaShape = QA_SCHEMA.shape.criteria.shape as Record<string, z.ZodTypeAny>;
    const keys = Object.keys(schemaShape).sort();
    expect(keys).toEqual([...MANDATORY_CRITERIA_KEYS].sort());
  });
});

describe("QA v3.1 mandatory guard", () => {
  for (const key of MANDATORY_CRITERIA_KEYS) {
    it(`기준 ${key} 누락 → schema_validation_failed (결손 허용 금지)`, async () => {
      const criteria = fullCriteria();
      delete criteria[key];
      const behavior: MockBehavior = {
        kind: "normal",
        data: {
          criteria,
          hasHallucination: false,
          isCopyrightSafe: true,
          criticalFlaws: [],
          pass: true,
        },
      };
      const provider = new MockLlmProvider(behavior);
      const result = await runAutoQa(candidate, content, provider);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe("schema_validation_failed");
    });
  }

  it("score 범위 밖(0 또는 6) 기준 → schema_validation_failed", async () => {
    const criteria = fullCriteria();
    criteria.fact_accuracy = { score: 6, note: null };
    const provider = new MockLlmProvider({
      kind: "normal",
      data: { criteria, hasHallucination: false, isCopyrightSafe: true, criticalFlaws: [], pass: true },
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("schema_validation_failed");
  });
});

describe("QA v3.1 pass gate (fail-closed)", () => {
  it("hasHallucination=true → AI pass=true 여도 강제 pass=false", async () => {
    const provider = new MockLlmProvider({
      kind: "normal",
      data: { ...qaPassPayload(), hasHallucination: true, pass: true },
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.pass).toBe(false);
  });

  it("criticalFlaws 존재 → AI pass=true 여도 강제 pass=false", async () => {
    const provider = new MockLlmProvider({
      kind: "normal",
      data: { ...qaPassPayload(), criticalFlaws: ["정답 보존 실패"], pass: true },
    });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.pass).toBe(false);
  });

  it("LLM 실패 여부와 무관하게 QA 실패는 ok:false로 보존된다 (No Drop)", async () => {
    const provider = new MockLlmProvider({ kind: "empty_response" });
    const result = await runAutoQa(candidate, content, provider);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.rawResponse).toBe("");
  });
});