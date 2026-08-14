import { describe, expect, it } from "vitest";
import {
  extractFactsDeterministic,
  extractFactsWithLlm,
  isGroundedStatement,
} from "../fact-extraction";
import type { CandidateContent } from "../types";
import { MockLlmProvider } from "../provider/mock";

function makeCandidate(overrides: Partial<CandidateContent> = {}): CandidateContent {
  return {
    id: "cq-1",
    category: "CAT-HANDLING",
    questionText: "화물 적재 시 무게 중심을 낮추면 안전하다. 낮은 무게 중심은 전복 위험을 줄인다.",
    choices: [
      { index: 1, text: "연비 향상을 위해" },
      { index: 2, text: "전복 사고를 줄이기 위해" },
      { index: 3, text: "적재량을 늘리기 위해" },
      { index: 4, text: "하역 속도를 높이기 위해" },
    ],
    normalizedAnswers: [2],
    explanation: "무게 중심이 낮으면 차량의 안정성이 높아져 전복 사고 위험이 줄어든다.",
    ...overrides,
  };
}

describe("Knowledge Extraction (STEP 8 §10)", () => {
  it("deterministic: 해설 → answer_basis, 질문 → context, 비정답 보기 → distractor_basis", () => {
    const result = extractFactsDeterministic(makeCandidate());

    expect(result.facts.some((f) => f.importance === "answer_basis")).toBe(true);
    expect(result.facts.some((f) => f.importance === "context")).toBe(true);
    expect(result.facts.some((f) => f.importance === "distractor_basis")).toBe(true);

    const distractor = result.facts.find(
      (f) => f.importance === "distractor_basis",
    );
    expect(distractor?.statement).toBe("연비 향상을 위해");

    expect(result.correctAnswerBasis).toContain("무게 중심");
    expect(result.method).toBe("deterministic");
  });

  it("deterministic: 해설이 없으면 질문을 answer_basis로 사용 + 경고", () => {
    const result = extractFactsDeterministic(
      makeCandidate({ explanation: null }),
    );
    expect(result.correctAnswerBasis).toBe(
      makeCandidate().questionText,
    );
    expect(result.warnings).toContain("explanation_missing_using_question_as_answer_basis");
  });

  it("deterministic: 외부 지식이 추가되지 않는다 (모든 fact가 원문 문장)", () => {
    const result = extractFactsDeterministic(makeCandidate());
    const source = [
      "화물 적재 시 무게 중심을 낮추면 안전하다. 낮은 무게 중심은 전복 위험을 줄인다.",
      "연비 향상을 위해",
      "전복 사고를 줄이기 위해",
      "적재량을 늘리기 위해",
      "하역 속도를 높이기 위해",
      "무게 중심이 낮으면 차량의 안정성이 높아져 전복 사고 위험이 줄어든다.",
    ].join(" ");
    for (const fact of result.facts) {
      expect(source).toContain(fact.statement);
    }
  });

  it("isGroundedStatement: 원문 포함 문장은 true", () => {
    expect(
      isGroundedStatement(
        "무게 중심이 낮으면 차량의 안정성이 높아져 전복 사고 위험이 줄어든다",
        makeCandidate().explanation!,
      ),
    ).toBe(true);
  });

  it("isGroundedStatement: 원문에 없는 문장은 false", () => {
    expect(
      isGroundedStatement("인터넷에서 새로 알게 된 사실입니다", makeCandidate().questionText),
    ).toBe(false);
  });

  it("LLM: grounding 통과한 사실만 채택, method=llm", async () => {
    const candidate = makeCandidate();
    const provider = new MockLlmProvider({
      kind: "normal",
      data: {
        facts: [
          { statement: "무게 중심이 낮으면 차량의 안정성이 높아져 전복 사고 위험이 줄어든다.", importance: "answer_basis" },
          { statement: "화물 적재 시 무게 중심을 낮추면 안전하다.", importance: "context" },
        ],
        correctAnswerBasis: "무게 중심이 낮으면 차량의 안정성이 높아져 전복 사고 위험이 줄어든다.",
        constraints: ["원문에만 근거한다"],
      },
    });
    const result = await extractFactsWithLlm(candidate, provider);
    expect(result.method).toBe("llm");
    expect(result.warnings.filter((w) => w.startsWith("ungrounded_fact_dropped"))).toHaveLength(0);
  });

  it("LLM: 원문에 없는 사실은 버려지고 deterministic으로 fallback (외부 지식 차단)", async () => {
    const candidate = makeCandidate();
    const provider = new MockLlmProvider({
      kind: "normal",
      data: {
        facts: [
          { statement: "인터넷에서 새로 알게 된 완전히 다른 사실입니다", importance: "answer_basis" },
        ],
        correctAnswerBasis: "외부에서 만든 근거",
        constraints: [],
      },
    });
    const result = await extractFactsWithLlm(candidate, provider);
    // grounding 실패 → deterministic fallback
    expect(result.method).toBe("deterministic");
    expect(result.warnings.some((w) => w.startsWith("llm_facts_not_grounded"))).toBe(true);
  });

  it("LLM: provider 실패 시 deterministic fallback + 경고 (No Drop)", async () => {
    const candidate = makeCandidate();
    const provider = new MockLlmProvider({ kind: "timeout" });
    const result = await extractFactsWithLlm(candidate, provider);
    expect(result.method).toBe("deterministic");
    expect(result.warnings.some((w) => w.startsWith("llm_fact_extraction_failed"))).toBe(true);
  });
});
