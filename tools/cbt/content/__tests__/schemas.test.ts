import { describe, expect, it } from "vitest";
import {
  AUTO_QA_PROMPT_VERSION,
  FACT_EXTRACTION_PROMPT_VERSION,
  FACT_EXTRACTION_SCHEMA,
  GENERATED_QUESTION_SCHEMA,
  QA_SCHEMA,
  QUESTION_GENERATION_PROMPT_VERSION,
} from "../schemas";
import { fullCriteria } from "./helpers";

describe("STEP 8 schema validation", () => {
  it("fact extraction schema: 정상 입력 통과", () => {
    const ok = FACT_EXTRACTION_SCHEMA.safeParse({
      facts: [{ statement: "원문 사실", importance: "answer_basis" }],
      correctAnswerBasis: "정답 근거",
      constraints: ["원문에만 근거한다"],
    });
    expect(ok.success).toBe(true);
  });

  it("fact extraction schema: importance가 허용 값이 아니면 실패", () => {
    const ok = FACT_EXTRACTION_SCHEMA.safeParse({
      facts: [{ statement: "원문 사실", importance: "invented" }],
      correctAnswerBasis: "정답 근거",
      constraints: [],
    });
    expect(ok.success).toBe(false);
  });

  it("generation schema: 4지선다 정상 입력 통과", () => {
    const ok = GENERATED_QUESTION_SCHEMA.safeParse({
      questionText: "질문",
      choices: [
        { text: "a" },
        { text: "b" },
        { text: "c" },
        { text: "d" },
      ],
      answers: [1],
      explanation: "해설",
      category: "CAT-HANDLING",
      difficulty: "MEDIUM",
      factSourceMapping: [
        { statement: "사실", usedAs: "answer_basis" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("generation schema: 3지선다는 실패", () => {
    const ok = GENERATED_QUESTION_SCHEMA.safeParse({
      questionText: "질문",
      choices: [{ text: "a" }, { text: "b" }, { text: "c" }],
      answers: [1],
      explanation: "해설",
      category: "CAT-HANDLING",
      difficulty: "MEDIUM",
      factSourceMapping: [],
    });
    expect(ok.success).toBe(false);
  });

  it("QA schema: 11개 기준 모두 있어야 통과", () => {
    const base = {
      hasHallucination: false,
      isCopyrightSafe: true,
      criticalFlaws: [],
      pass: true,
    };
    const full = { ...base, criteria: fullCriteria() };
    expect(QA_SCHEMA.safeParse(full).success).toBe(true);

    // 기준 하나 누락 시 실패
    const { fact_accuracy, ...rest } = full.criteria;
    void fact_accuracy;
    const missing = { ...base, criteria: rest };
    expect(QA_SCHEMA.safeParse(missing).success).toBe(false);
  });

  it("QA schema: score 범위(1~5) 밖이면 실패", () => {
    const criteria = fullCriteria();
    criteria.ambiguity = { score: 7, note: null };
    const ok = QA_SCHEMA.safeParse({
      hasHallucination: false,
      isCopyrightSafe: true,
      criticalFlaws: [],
      pass: true,
      criteria,
    });
    expect(ok.success).toBe(false);
  });

  it("prompt version 상수는 명시적이다", () => {
    expect(FACT_EXTRACTION_PROMPT_VERSION).toBe("step8-fact-extract-v1");
    expect(QUESTION_GENERATION_PROMPT_VERSION).toBe("step8-question-gen-v1.1");
    expect(AUTO_QA_PROMPT_VERSION).toBe("step8-auto-qa-v3.1");
  });

  it("generation schema: input importance 전용 context는 usedAs로 거부한다", () => {
    expect(GENERATED_QUESTION_SCHEMA.safeParse({
      questionText: "질문", choices: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }],
      answers: [1], explanation: "해설", category: "CAT-HANDLING", difficulty: "MEDIUM",
      factSourceMapping: [{ statement: "사실", usedAs: "context" }],
    }).success).toBe(false);
  });
});
