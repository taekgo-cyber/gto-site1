// STEP 8 — CBT Content Production 도메인 타입 (Session 10-1 STEP 8 §3/§4/§5/§10/§11/§14).
// CandidateQuestion → Fact Extraction → GeneratedQuestion → Auto-QA → Human Review → MasterQuestion.
// 기존 STEP 1~7의 파이프라인 타입을 수정하지 않고, 파생 콘텐츠 레이어만 새로 정의한다.
import type { CbtCategoryCode } from "../types";

/** GeneratedQuestion 상태 (Prisma enum GeneratedQuestionStatus와 1:1) */
export type GeneratedQuestionStatus =
  | "GENERATED"
  | "QA_PENDING"
  | "QA_PASSED"
  | "QA_FAILED"
  | "HUMAN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "FAILED";

export const GENERATED_QUESTION_STATUSES: readonly GeneratedQuestionStatus[] = [
  "GENERATED",
  "QA_PENDING",
  "QA_PASSED",
  "QA_FAILED",
  "HUMAN_REVIEW",
  "APPROVED",
  "REJECTED",
  "FAILED",
];

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "HARD"];

export type FactImportance = "answer_basis" | "context" | "distractor_basis";

export const FACT_IMPORTANCES: readonly FactImportance[] = [
  "answer_basis",
  "context",
  "distractor_basis",
];

/** 문제 생성 시 원문의 어느 사실을 어떤 용도로 썼는지 기록 (factSourceMapping) */
export type FactSourceMappingEntry = {
  statement: string;
  usedAs: "question_basis" | "answer_basis" | "distractor_basis" | "explanation_basis";
};

export const FACT_SOURCE_USAGES: readonly FactSourceMappingEntry["usedAs"][] = [
  "question_basis",
  "answer_basis",
  "distractor_basis",
  "explanation_basis",
];

/** 원문(CandidateQuestion)에서 뽑은 구조화 사실 (STEP 8 §10) */
export type ExtractedFact = {
  statement: string;
  importance: FactImportance;
};

export type FactExtractionResult = {
  facts: ExtractedFact[];
  correctAnswerBasis: string;
  constraints: string[];
  method: "deterministic" | "llm";
  warnings: string[];
};

/** Content 파이프라인이 Candidate에서 읽는 최소 뷰 (원본 불변, 읽기 전용) */
export type CandidateContent = {
  id: string;
  category: string;
  questionText: string;
  choices: { index: number; text: string }[];
  normalizedAnswers: number[];
  explanation: string | null;
};

/** 생성 결과 문제 (4지선다, 검증 통과 후) */
export type GeneratedContent = {
  questionText: string;
  choices: { index: number; text: string }[];
  answers: number[];
  explanation: string;
  category: CbtCategoryCode;
  difficulty: Difficulty;
  factSourceMapping: FactSourceMappingEntry[];
};

/** AI Auto-QA 평가 기준 키 (STEP 8 §14 목록 11개) */
export const QA_CRITERIA_KEYS = [
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

export type QaCriteriaKey = (typeof QA_CRITERIA_KEYS)[number];

export type QaCriteriaEntry = {
  score: number; // 1..5
  note: string | null;
};

/** QA 평가 결과. isCopyrightSafe는 참고용이며 법적 판정이 아니다 (STEP 8 §14/§15) */
export type QaEvaluation = {
  criteria: Record<QaCriteriaKey, QaCriteriaEntry>;
  hasHallucination: boolean;
  isCopyrightSafe: boolean;
  criticalFlaws: string[];
  pass: boolean;
};

/** LLM 실패 코드 (STEP 8 §9/§16 No Drop에 기록)
 * transient(재시도 대상): timeout / provider_error(network) / rate_limited(429) / server_error(5xx)
 * terminal(재시도 금지): http_client_error(그 외 4xx) / malformed_json / empty_response /
 *                        schema_validation_failed / content_invalid / fact_extraction_failed / not_configured
 */
export type LlmFailureCode =
  | "timeout"
  | "provider_error"
  | "rate_limited"
  | "server_error"
  | "http_client_error"
  | "malformed_json"
  | "empty_response"
  | "schema_validation_failed"
  | "content_invalid"
  | "fact_extraction_failed"
  | "not_configured";

export type LlmFailure = {
  code: LlmFailureCode;
  message: string;
  rawResponse: string | null;
  /** HTTP 상태 코드 (provider 응답 기반 실패 시). 분류 정보 보존용 */
  status?: number;
  /** Retry-After 헤더가 유효했을 때 서버가 요청한 대기(ms). transient에만 존재 (보존용) */
  retryAfterMs?: number;
  /** provider가 반환한 안전한 오류 detail (error.message/type/param/code만, bounded). raw body/secret 미포함 */
  detail?: string;
  provider: string;
  model: string;
  promptVersion: string;
};
