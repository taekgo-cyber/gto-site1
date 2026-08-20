// STEP 8 — Provider 선택 (STEP 8 §24).
// production CLI(cbt:generate, cbt:batch-generate)는 createConfiguredProvider의
// fail-closed preflight를 거쳐야 한다 — API key/baseUrl/model가 유효하지 않으면
// DB/LLM 쓰기 전에 실행을 거부한다. production에는 --mock 옵션 없음.
// Mock은 createDefaultProvider가 키 부재 시 테스트/스크립트 전용으로만 선택한다.
import {
  CBT_LLM_MAX_RETRIES,
  CBT_LLM_TIMEOUT_MS,
  CBT_RETRY_BASE_DELAY_MS,
} from "../../config";
import type { LlmProvider } from "./types";
import { MockLlmProvider } from "./mock";
import { OpenAiCompatibleProvider } from "./openai";
import type { GeneratedQuestionLlmOutput, QaLlmOutput } from "../schemas";

// ---------------------------------------------------------------------------
// runtime env helper — 생성/검증 호출 시점마다 현재 process.env를 읽는다.
// config.ts의 import-time 고정값을 쓰면 테스트가 env를 바꿔도 반영되지 않는다.
// baseUrl/model은 명시됐을 때만 사용(빈 문자열은 그대로 전달해 검증에서 실패).
// ---------------------------------------------------------------------------

function readRuntimeProviderEnv(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  return {
    // API key는 항상 call 시점 값. 부재 시 "" → 검증/fallback이 처리한다.
    apiKey: process.env.CBT_LLM_API_KEY ?? "",
    baseUrl:
      process.env.CBT_LLM_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.CBT_LLM_MODEL ?? "deepseek-chat",
  };
}

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
 * OpenAI-compatible Provider 인스턴스 생성 (config에서 retry/backoff 주입).
 * 재시도 정책(최대 횟수/기본 backoff)은 config.ts의 값을 그대로 존중한다.
 */
export function createOpenAiProvider(): OpenAiCompatibleProvider {
  const { apiKey, baseUrl, model } = readRuntimeProviderEnv();
  return new OpenAiCompatibleProvider({
    baseUrl,
    apiKey,
    model,
    timeoutMs: CBT_LLM_TIMEOUT_MS,
    maxRetries: CBT_LLM_MAX_RETRIES,
    backoffBaseMs: CBT_RETRY_BASE_DELAY_MS,
  });
}

/** baseUrl이 HTTP(S) URL이고 model이 비어있지 않은지 검사한다 (preflight) */
export function assertValidProviderConfig(): void {
  const { baseUrl, model } = readRuntimeProviderEnv();
  if (!/^https?:\/\/.+/.test(baseUrl.trim())) {
    throw new Error(
      `CBT_LLM_BASE_URL이 올바른 HTTP(S) URL이 아닙니다: "${baseUrl}"`,
    );
  }
  if (model.trim() === "") {
    throw new Error("CBT_LLM_MODEL이 설정되지 않았습니다.");
  }
}

/**
 * production CLI 전용 Provider 생성 (fail-closed preflight).
 * 실제 실행은 OpenAI-compatible 유효 설정만 허용한다. Mock으로 조용히 대체하거나
 * --mock opt-in을 두지 않는다. CBT_LLM_API_KEY 부재 또는
 * CBT_LLM_BASE_URL/CBT_LLM_MODEL 무효 시 DB/LLM 쓰기 전에 throw한다.
 * mock이 필요한 단위테스트는 deps.provider로 명시 주입한다 (createDefaultProvider).
 */
export function createConfiguredProvider(): LlmProvider {
  const { apiKey } = readRuntimeProviderEnv();
  if (apiKey.trim() === "") {
    throw new Error(
      "CBT_LLM_API_KEY가 설정되지 않았습니다. 실제 API 자격 증명을 설정한 뒤 실행하세요.",
    );
  }
  assertValidProviderConfig();
  return createOpenAiProvider();
}

/**
 * 기본 Provider 선택.
 * - CBT_LLM_API_KEY가 설치되면 OpenAI-compatible 실제 API.
 * - 없으면 Mock (질문 생성 + QA 통과 스크립트).
 * 자동 mock fallback이 필요한 테스트/단순 스크립트용. production CLI는
 * createConfiguredProvider를 사용한다.
 */
export function createDefaultProvider(): LlmProvider {
  const { apiKey } = readRuntimeProviderEnv();
  if (apiKey.trim() !== "") {
    return createOpenAiProvider();
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