// STEP 8 — Provider 선택 (STEP 8 §24).
// API Key가 없으면 Mock Provider로 전체 Golden Path를 검증한다.
// Mock 기본 스크립트 = [질문 생성, QA 통과] 순서.
import { CBT_LLM_API_KEY, CBT_LLM_BASE_URL, CBT_LLM_MAX_RETRIES, CBT_LLM_MODEL, CBT_LLM_TIMEOUT_MS } from "../../config";
import type { LlmProvider } from "./types";
import { MockLlmProvider } from "./mock";
import { OpenAiCompatibleProvider } from "./openai";
import type { GeneratedQuestionLlmOutput, QaLlmOutput } from "../schemas";

// ---------------------------------------------------------------------------
// Mock 기본 페이로드 (Golden Path 사람 확인용). 실제 API 없이도 동작한다.
// ---------------------------------------------------------------------------

export const MOCK_GENERATED_QUESTION: GeneratedQuestionLlmOutput = {
  questionText:
    "화물을 적재할 때 화물차의 안정성을 높이기 위한 올바른 방법은 무엇인가?",
  choices: [
    { text: "무거운 화물을 차량의 한쪽에 치우쳐 적재한다" },
    { text: "무거운 화물을 차량의 중심에 가깝게 고르게 적재한다" },
    { text: "모든 화물을 차량 뒤쪽 끝에만 실는다" },
    { text: "화물이 차량 밖으로 돌출되도록 적재한다" },
  ],
  answers: [2],
  explanation:
    "무거운 화물을 차량의 중심에 가깝게 배치하면 무게 중심이 안정되어 전복과 사고 위험을 줄일 수 있다.",
  category: "CAT-HANDLING",
  difficulty: "MEDIUM",
  factSourceMapping: [
    {
      statement: "화물 적재 시 무게 중심을 낮추고 안정적으로 배치한다",
      usedAs: "answer_basis",
    },
  ],
};

export const MOCK_QA_PASS: QaLlmOutput = {
  criteria: {
    fact_accuracy: { score: 5, note: "원문 사실과 일치" },
    answer_accuracy: { score: 5, note: "정답이 사실에 근거" },
    single_answer: { score: 5, note: "정답 1개 명확" },
    option_plausibility: { score: 4, note: "오답이 그럴듯함" },
    question_clarity: { score: 5, note: "질문 명확" },
    ambiguity: { score: 5, note: "애매함 없음" },
    explanation_accuracy: { score: 5, note: "해설 정확" },
    hallucination: { score: 5, note: "환각 없음" },
    fact_source_consistency: { score: 5, note: "facts와 일치" },
    duplicate_risk: { score: 4, note: "원문과 충분히 다름" },
    expression_quality: { score: 5, note: "표현 자연스러움" },
  },
  hasHallucination: false,
  isCopyrightSafe: true,
  criticalFlaws: [],
  pass: true,
};

/**
 * 기본 Provider 선택.
 * - CBT_LLM_API_KEY가 설정되면 OpenAI-compatible 실제 API.
 * - 없으면 Mock (질문 생성 + QA 통과 스크립트).
 */
export function createDefaultProvider(): LlmProvider {
  const apiKey = CBT_LLM_API_KEY;
  if (apiKey !== undefined && apiKey.trim() !== "") {
    return new OpenAiCompatibleProvider({
      baseUrl: CBT_LLM_BASE_URL,
      apiKey,
      model: CBT_LLM_MODEL,
      timeoutMs: CBT_LLM_TIMEOUT_MS,
      maxRetries: CBT_LLM_MAX_RETRIES,
    });
  }
  return new MockLlmProvider([
    { kind: "normal", data: MOCK_GENERATED_QUESTION },
    { kind: "normal", data: MOCK_QA_PASS },
  ]);
}

export { MockLlmProvider } from "./mock";
export { OpenAiCompatibleProvider } from "./openai";
export type { LlmProvider, StructuredGenerationResult, ZodSchema } from "./types";
export type { MockBehavior, MockScript } from "./mock";