// STEP 8 — Knowledge Extraction (STEP 8 §10).
// Candidate 원문을 그대로 생성 모델에 던져 문장을 바꾸는 방식이 아니라,
// 원문 → Fact 구조화 → (생성) 흐름을 사용한다.
//
// 원칙:
//  - 외부 지식 추가 금지: 입력 Candidate에 없는 사실을 만들지 않는다.
//  - deterministic 추출이 기본이며, LLM 추출은 grounding guardrail을 통과한 문장만 채택한다.
//  - guardrail 실패 시 deterministic 결과로 fallback하고 경고를 기록한다 (No Drop).
//  - Candidate는 절대 수정하지 않는다 (읽기 전용).
import type { CandidateContent, ExtractedFact, FactExtractionResult } from "./types";
import type { LlmProvider } from "./provider/types";
import { FACT_EXTRACTION_PROMPT_VERSION, FACT_EXTRACTION_SCHEMA } from "./schemas";
import { buildFactExtractionPrompt } from "./prompts";
import { tokenizeText } from "./similarity";

const MIN_GROUNDING_OVERLAP = 0.6;

/** 문장 분리 (마침표/물음표/느낌표/개행 기준). 빈 문장 제거 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。．？！\n])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** statement가 원문(source)에 grounding 되어 있는지 검사 (token overlap 기준) */
export function isGroundedStatement(
  statement: string,
  sourceText: string,
  minOverlap: number = MIN_GROUNDING_OVERLAP,
): boolean {
  const sourceTokens = new Set(tokenizeText(sourceText));
  if (sourceTokens.size === 0) return false;

  const statementTokens = tokenizeText(statement).filter((t) => t.length > 0);
  if (statementTokens.length === 0) return false;

  let hit = 0;
  for (const token of statementTokens) {
    if (sourceTokens.has(token)) hit += 1;
  }
  return hit / statementTokens.length >= minOverlap;
}

/**
 * deterministic fact extraction.
 * 원문에 명시된 내용만 그대로 사용한다:
 *  - 해설(있으면) 문장 → answer_basis
 *  - 질문 문장 → context
 *  - 비정답 보기 → distractor_basis
 *  - correctAnswerBasis = 해설 or 질문
 */
export function extractFactsDeterministic(
  candidate: CandidateContent,
): FactExtractionResult {
  const warnings: string[] = [];
  const facts: ExtractedFact[] = [];

  const explanationSentences = candidate.explanation
    ? splitSentences(candidate.explanation)
    : [];
  const questionSentences = splitSentences(candidate.questionText);

  if (explanationSentences.length > 0) {
    for (const sentence of explanationSentences) {
      facts.push({ statement: sentence, importance: "answer_basis" });
    }
  } else {
    for (const sentence of questionSentences) {
      facts.push({ statement: sentence, importance: "answer_basis" });
    }
    warnings.push("explanation_missing_using_question_as_answer_basis");
  }

  for (const sentence of questionSentences) {
    facts.push({ statement: sentence, importance: "context" });
  }

  const answerSet = new Set(candidate.normalizedAnswers);
  for (const choice of candidate.choices) {
    if (answerSet.has(choice.index)) continue;
    facts.push({ statement: choice.text, importance: "distractor_basis" });
  }

  if (facts.length === 0) {
    warnings.push("no_facts_extracted");
  }

  return {
    facts,
    correctAnswerBasis: candidate.explanation ?? candidate.questionText,
    constraints: [
      "원문에만 근거한다 (외부 지식 금지)",
      "복수 정답 금지 (4지선다, 정답 1개)",
    ],
    method: "deterministic",
    warnings,
  };
}

function buildSourceText(candidate: CandidateContent): string {
  return [
    candidate.questionText,
    ...candidate.choices.map((c) => c.text),
    candidate.explanation ?? "",
  ].join("\n");
}

/** fallback 결과에 LLM 경로에서 발생한 경고를 누적해 반환한다 (No Drop) */
function withWarnings(
  result: FactExtractionResult,
  additional: string[],
): FactExtractionResult {
  if (additional.length === 0) return result;
  return { ...result, warnings: [...additional, ...result.warnings] };
}

/**
 * LLM fact extraction (grounding guardrail 포함).
 * - LLM 결과의 각 사실이 원문에 grounding 되어 있는지 검사한다.
 * - grounding 되지 않은 사실은 버리고 경고를 남긴다.
 * - answer basis가 grounding 실패하거나 사실이 전부 버려지면 deterministic으로 fallback.
 */
export async function extractFactsWithLlm(
  candidate: CandidateContent,
  provider: LlmProvider,
): Promise<FactExtractionResult> {
  const warnings: string[] = [];
  const sourceText = buildSourceText(candidate);

  const result = await provider.generateStructured(
    buildFactExtractionPrompt(candidate),
    FACT_EXTRACTION_SCHEMA,
    { promptVersion: FACT_EXTRACTION_PROMPT_VERSION },
  );

  if (!result.ok) {
    warnings.push(`llm_fact_extraction_failed:${result.error.code}`);
    return withWarnings(extractFactsDeterministic(candidate), warnings);
  }

  const output = result.data;
  const groundedFacts: ExtractedFact[] = [];
  for (const fact of output.facts) {
    if (isGroundedStatement(fact.statement, sourceText)) {
      groundedFacts.push(fact);
    } else {
      warnings.push(`ungrounded_fact_dropped:${fact.statement.slice(0, 40)}`);
    }
  }

  const answerBasisGrounded = isGroundedStatement(
    output.correctAnswerBasis,
    sourceText,
  );

  if (groundedFacts.length === 0 || !answerBasisGrounded) {
    warnings.push("llm_facts_not_grounded_falling_back_to_deterministic");
    return withWarnings(extractFactsDeterministic(candidate), warnings);
  }

  return {
    facts: groundedFacts,
    correctAnswerBasis: output.correctAnswerBasis,
    constraints: output.constraints,
    method: "llm",
    warnings,
  };
}

/**
 * Candidate에서 facts 추출.
 * - provider 미지정 → deterministic (기본, 안전).
 * - provider 지정 → LLM 추출을 시도하고, guardrail 실패 시 deterministic fallback.
 */
export async function extractFactsFromCandidate(
  candidate: CandidateContent,
  provider?: LlmProvider,
): Promise<FactExtractionResult> {
  if (!provider) return extractFactsDeterministic(candidate);
  return extractFactsWithLlm(candidate, provider);
}
