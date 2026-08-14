// STEP 8 — LLM prompt 빌더 (Fact Extraction / Question Generation / Auto-QA).
// Generator와 QA는 독립적인 system prompt를 사용한다 (STEP 8 §14).
// 원칙: 외부 지식을 요구하지 않고, 입력 원문에만 근거하도록 지시한다.
import type { CandidateContent } from "./types";
import type { JSONType } from "zod";

function jsonSchemaHint(schema: { name: string; example: JSONType }): string {
  return [
    `반드시 다음 JSON 형식으로만 응답한다 (마크다운 코드블록 금지):`,
    JSON.stringify(schema.example, null, 2),
  ].join("\n");
}

function candidateBlock(candidate: CandidateContent): string {
  return [
    "## 원문 (후보 문제. 이 내용에만 근거한다)",
    `카테고리: ${candidate.category}`,
    `질문: ${candidate.questionText}`,
    `보기: ${candidate.choices.map((c) => `${c.index}. ${c.text}`).join(" | ")}`,
    candidate.explanation ? `해설: ${candidate.explanation}` : "해설: (없음)",
    "",
    "외부 지식, 인터넷 검색, 추측을 절대 추가하지 마라. 원문에 없는 사실을 만들지 마라.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Fact Extraction
// ---------------------------------------------------------------------------

export const FACT_EXTRACTION_SYSTEM_PROMPT =
  "당신은 화물운송종사자격시험 문제 출제를 위한 사실 추출기(fact extractor)입니다. 원문에 명시된 내용만 구조화한다.";

export function buildFactExtractionPrompt(
  candidate: CandidateContent,
): string {
  return [
    FACT_EXTRACTION_SYSTEM_PROMPT,
    "",
    candidateBlock(candidate),
    "",
    "원문의 질문/보기/해설에서 시험 문제 출제에 필요한 사실을 뽑아라.",
    "- statement: 원문 그대로 또는 원문에 완전히 근거한 한 문장",
    "- importance: answer_basis(정답 근거) / context(배경) / distractor_basis(오답 근거)",
    "- correctAnswerBasis: 정답을 뒷받침하는 핵심 근거 한 문장",
    "- constraints: 출제 시 지켜야 할 제약(예: 복수 정답 금지, 원문 근거만 사용)",
    "",
    jsonSchemaHint({
      name: "FactExtraction",
      example: {
        facts: [
          {
            statement: "원문에서 뽑은 사실 문장",
            importance: "answer_basis",
          },
        ],
        correctAnswerBasis: "정답 근거 문장",
        constraints: ["원문에만 근거한다"],
      },
    }),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Question Generation
// ---------------------------------------------------------------------------

export const QUESTION_GENERATION_SYSTEM_PROMPT =
  "당신은 화물운송종사자격시험 문제 출제자입니다. 제공된 사실(facts)만을 바탕으로 새 문제를 출제한다. 원문을 단순히 단어 치환하지 않고, 사실을 재구성해 새로운 질문 구조와 표현을 만든다.";

export function buildQuestionGenerationPrompt(
  candidate: CandidateContent,
  facts: { statement: string; importance: string }[],
  correctAnswerBasis: string,
  constraints: string[],
): string {
  return [
    QUESTION_GENERATION_SYSTEM_PROMPT,
    "",
    candidateBlock(candidate),
    "",
    "## 추출된 사실",
    ...facts.map((f) => `- [${f.importance}] ${f.statement}`),
    `정답 근거: ${correctAnswerBasis}`,
    "",
    "## 출제 제약",
    ...constraints.map((c) => `- ${c}`),
    "- 4지선다, 정답 1개, 복수 정답 금지",
    "- 정답 보기는 반드시 사실에 근거해야 한다",
    "- factSourceMapping: 각 생성 요소가 위 facts 중 어느 statement에서 비롯됐는지 기록",
    "",
    "## 생성 결과 요구사항",
    "- questionText: 새 질문 (원문 문장 복사 금지, 재구성)",
    "- choices: 4개 (text만, 번호는 넣지 않는다)",
    "- answers: 정답 보기 index (1~4)",
    "- explanation: 정답 근거 해설 (facts 근거)",
    "- category: 4개 코드 중 하나 (CAT-LAW/CAT-HANDLING/CAT-SAFETY/CAT-SERVICE)",
    "- difficulty: EASY/MEDIUM/HARD",
    "- factSourceMapping: [{ statement: 위 facts의 원문 문장, usedAs: question_basis|answer_basis|distractor_basis|explanation_basis }]",
    "",
    jsonSchemaHint({
      name: "GeneratedQuestion",
      example: {
        questionText: "새 문제 질문",
        choices: [{ text: "보기 1" }, { text: "보기 2" }, { text: "보기 3" }, { text: "보기 4" }],
        answers: [1],
        explanation: "정답 근거 해설",
        category: "CAT-HANDLING",
        difficulty: "MEDIUM",
        factSourceMapping: [
          { statement: "facts 중 하나의 원문 문장", usedAs: "answer_basis" },
        ],
      },
    }),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Auto-QA (STEP 8 §14 — Generator와 분리된 독립 검수)
// ---------------------------------------------------------------------------

export const AUTO_QA_SYSTEM_PROMPT =
  "당신은 화물운송종사자격시험 문제 검수자(QA)입니다. 원문과 생성된 문제를 대조해 11개 기준으로 평가한다. isCopyrightSafe는 참고용 평가이며 법적 판정이 아니다.";

export function buildAutoQaPrompt(
  candidate: CandidateContent,
  content: { questionText: string; choices: { index: number; text: string }[]; answers: number[]; explanation: string; category: string; difficulty: string },
): string {
  return [
    AUTO_QA_SYSTEM_PROMPT,
    "",
    candidateBlock(candidate),
    "",
    "## 생성된 문제",
    `카테고리: ${content.category}`,
    `난이도: ${content.difficulty}`,
    `질문: ${content.questionText}`,
    `보기: ${content.choices.map((c) => `${c.index}. ${c.text}`).join(" | ")}`,
    `정답: ${content.answers.join(",")}`,
    `해설: ${content.explanation}`,
    "",
    "## 평가 기준 (각 score 1~5, note는 이유)",
    "1. fact_accuracy: 생성 내용이 원문 사실과 일치하는가",
    "2. answer_accuracy: 정답이 사실에 근거하는가",
    "3. single_answer: 정답이 명확히 1개인가",
    "4. option_plausibility: 오답 보기가 논리적으로 타당한가",
    "5. question_clarity: 질문이 명확한가",
    "6. ambiguity: 애매모호한 표현이 없는가",
    "7. explanation_accuracy: 해설이 정답을 정확히 설명하는가",
    "8. hallucination: 원문에 없는 내용이 있는가",
    "9. fact_source_consistency: facts 근거와 일치하는가",
    "10. duplicate_risk: 원문과 지나치게 유사하거나 중복 위험이 있는가",
    "11. expression_quality: 표현 품질",
    "",
    "## 응답 규칙",
    "- criticalFlaws: 치명적 결함(환각/오답/복수 정답/원문 훼손 등) 있으면 목록, 없으면 []",
    "- pass: criticalFlaws가 하나라도 있으면 반드시 false",
    "- hasHallucination: 원문에 없는 사실이 하나라도 쓰였으면 true",
    "- isCopyrightSafe: 참고용 평가값 (법적 판정 금지)",
    "",
    jsonSchemaHint({
      name: "AutoQaResult",
      example: {
        criteria: {
          fact_accuracy: { score: 5, note: "이유" },
          answer_accuracy: { score: 5, note: "이유" },
          single_answer: { score: 5, note: "이유" },
          option_plausibility: { score: 5, note: "이유" },
          question_clarity: { score: 5, note: "이유" },
          ambiguity: { score: 5, note: "이유" },
          explanation_accuracy: { score: 5, note: "이유" },
          hallucination: { score: 5, note: "이유" },
          fact_source_consistency: { score: 5, note: "이유" },
          duplicate_risk: { score: 5, note: "이유" },
          expression_quality: { score: 5, note: "이유" },
        },
        hasHallucination: false,
        isCopyrightSafe: true,
        criticalFlaws: [],
        pass: true,
      },
    }),
  ].join("\n");
}
