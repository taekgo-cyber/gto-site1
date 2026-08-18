import { describe, expect, it } from "vitest";
import { runAutoQa } from "../qa";
import { MockLlmProvider } from "../provider/mock";
import { MOCK_GENERATED_QUESTION } from "../provider";
import type { CandidateContent, GeneratedContent } from "../types";
import { fullCriteria } from "./helpers";
import type { QaLlmOutput } from "../schemas";
import { buildAutoQaPrompt } from "../prompts";

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
      expect(result.promptVersion).toBe("step8-auto-qa-v3");
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

  // ---- 회귀: 원문 정답 보기 전달/셔플 대비 (92628/92449 사례 재발 방지) ----
  it("QA 프롬프트가 원문의 정답 보기 텍스트를 포함한다", () => {
    const prompt = buildAutoQaPrompt(candidate, content);
    expect(prompt).toContain("원문의 정답 보기:");
    expect(prompt).toContain("2. 전복 사고 예방");
  });

  it("QA 프롬프트가 생성 보기 순서가 원문과 다를 수 있음을 지침으로 명시한다", () => {
    const prompt = buildAutoQaPrompt(candidate, content);
    expect(prompt).toContain("보기 순서는 원문과 다를 수 있다");
    expect(prompt).toContain("번호(index)가 아닌 보기 텍스트로");
  });

  it("원문 정답 텍스트가 생성 정답 보기로 옮겨도(셔플) QA는 텍스트로 판단한다", async () => {
    const shuffled = {
      ...content,
      choices: [
        { index: 1, text: content.choices[1].text },
        { index: 2, text: content.choices[2].text },
        { index: 3, text: content.choices[3].text },
        { index: 4, text: content.choices[0].text },
      ],
      answers: [4],
    };
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
    const result = await runAutoQa(candidate, shuffled, provider);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 회귀: 100건 검증에서 적발된 QA false-positive(92502/92510)와 과잉 rejection(92571)
// 재발 방지를 위한 필수 검수 규칙(A~E)이 프롬프트에 명시되는지 고정한다.
// (실측 LLM 판단은 유닛 테스트로 재현할 수 없으므로, 가드 지침 문구를 회귀 고정한다.)
// ---------------------------------------------------------------------------
describe("QA 필수 검수 규칙 회귀 (92502/92510/92571)", () => {
  it("B/C: 92502형 — 원문 정답 강등·원문 오답 승격을 금지하는 규칙이 명시된다", () => {
    const prompt = buildAutoQaPrompt(candidate, content);
    expect(prompt).toContain(
      "원문 정답이 오답으로 이동하고 원문 오답이 정답으로 승격된 경우",
    );
    expect(prompt).toContain(
      "'의미상 유사하다'는 이유만으로 PASS해서는 안 된다",
    );
    expect(prompt).toContain("원문의 정답 보기가 생성 보기 어디에도 보존되지 않았으면");
  });

  it("A: 92510형 — 정량→정성 질문 전환과 질문 초점 보존 규칙이 명시된다", () => {
    const prompt = buildAutoQaPrompt(candidate, content);
    expect(prompt).toContain("질문 의도/초점 보존");
    expect(prompt).toContain("얼마나/몇 %/몇 회/몇 mm");
    expect(prompt).toContain("왜/어떤 이유");
    expect(prompt).toContain("원문 정답 텍스트가 생성 보기에 보존됐는지");
  });

  it("D: 92571형 — 자연스러운 표현 재구성·주어 보충은 hallucination이 아니다", () => {
    const prompt = buildAutoQaPrompt(candidate, content);
    expect(prompt).toContain("문맥상 명백한 주어");
    expect(prompt).toContain("화물운송종사자가");
    expect(prompt).toContain("hallucination이 아니다");
  });

  it("B/E: answer_accuracy는 원문의 정답 보기와만 직접 대조한다는 규칙이 명시된다", () => {
    const prompt = buildAutoQaPrompt(candidate, content);
    expect(prompt).toContain("원문의 다른 보기와 비교하지 않는다");
    expect(prompt).toContain("그 보기가 생성 정답일 때만 answer_accuracy를 높게");
  });

  it("92502 실데이터형: 원문 정답 텍스트(이상 발열냄새 등의 점검)가 프롬프트로 전달된다", () => {
    const c92502: CandidateContent = {
      id: "cq-92502",
      category: "CAT-SAFETY",
      questionText:
        "화물자동차 운전 전 점검에서 차량 상태를 확인할 때 다음 중 올바른 점검 항목은?",
      choices: [
        { index: 1, text: "타이어 표면의 마모, 공기압 상태 확인" },
        { index: 2, text: "등화장치의 작동 상태 확인" },
        { index: 3, text: "이상 발열냄새 등의 점검" },
        { index: 4, text: "엔진오일 양과 냉각수 보충" },
      ],
      normalizedAnswers: [3],
      explanation: "운전 전 이상 발열냄새 등의 점검은 화재 예방에 중요하다.",
    };
    const prompt = buildAutoQaPrompt(c92502, content);
    expect(prompt).toContain("원문의 정답 보기: 3. 이상 발열냄새 등의 점검");
    expect(prompt).toContain(
      "원문 정답이 오답으로 이동하고 원문 오답이 정답으로 승격된 경우",
    );
  });
});
