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
  "당신은 화물운송종사자격시험 문제 검수자(QA)입니다. 원문과 생성된 문제를 대조해 11개 기준과 필수 검수 규칙에 따라 평가한다. 특히 '원문 정답의 보존'과 '질문 의도(초점)의 유지'를 반드시 확인한다. isCopyrightSafe는 참고용 평가이며 법적 판정이 아니다.";

export function buildAutoQaPrompt(
  candidate: CandidateContent,
  content: { questionText: string; choices: { index: number; text: string }[]; answers: number[]; explanation: string; category: string; difficulty: string },
): string {
  const sourceAnswerChoices = candidate.normalizedAnswers
    .map((answerIndex) => {
      const choice = candidate.choices.find((c) => c.index === answerIndex);
      return choice ? `${answerIndex}. ${choice.text}` : `${answerIndex}`;
    })
    .join(", ");

  return [
    AUTO_QA_SYSTEM_PROMPT,
    "",
    candidateBlock(candidate),
    `원문의 정답 보기: ${sourceAnswerChoices}`,
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
    "1. fact_accuracy: 생성 내용이 원문 사실과 일치하는가 (질문 초점이 원문과 달라지면 낮게 평가)",
    "2. answer_accuracy: 생성 정답이 '원문의 정답 보기'와 의미상 일치하는가 (번호가 아닌 보기 텍스트로 대조, 순서는 달라도 된다)",
    "3. single_answer: 정답이 명확히 1개인가",
    "4. option_plausibility: 오답 보기가 논리적으로 타당한가",
    "5. question_clarity: 질문이 명확한가",
    "6. ambiguity: 애매모호한 표현이 없는가",
    "7. explanation_accuracy: 해설이 정답을 정확히 설명하는가",
    "8. hallucination: Question/Choices/Explanation에 원문에 없는 새로운 독립 사실이 추가되었는가 (표현 재구성·동의어 치환·단순 주어 보충은 환각이 아니다)",
    "9. fact_source_consistency: facts 근거와 일치하는가",
    "10. duplicate_risk: 원문과 지나치게 유사하거나 중복 위험이 있는가",
    "11. expression_quality: 표현 품질",
    "",
    "## 필수 검수 규칙 (criticalFlaws 판단의 강제 기준. 아래에 해당하면 반드시 criticalFlaws에 기록하고 pass=false)",
    "A. 질문 의도/초점 보존: 원문의 질문이 무엇을 묻는지 핵심 의도를 보존해야 한다.",
    "   - 질문 대상, 조건, 수치, 범위, 비교 기준, 원인/결과 관계 중 하나라도 바뀌어 정답이 달라질 수 있으면 FAIL.",
    "   - 특히 정량 질문(얼마나/몇 %/몇 회/몇 mm/몇 배 등)을 정성 질문(왜/어떤 이유/목적 등)으로 바꾼 경우 반드시 검출해 FAIL.",
    "   - 질문 초점이 원문과 다르면 원문 정답 텍스트가 생성 보기에 보존됐는지와 무관하게 FAIL.",
    "B. 원문 정답 보존(Answer Preservation): 생성된 선택지 중에 반드시 원문 정답의 의미가 하나라도 보존되어야 한다.",
    "   - 정답 번호는 셔플될 수 있으므로 번호를 비교하지 않고, 반드시 보기 텍스트의 의미로 대조한다.",
    "   - 원문의 정답 보기가 생성 보기 어디에도 보존되지 않았으면 FAIL.",
    "   - 생성 정답의 의미가 원문의 정답 보기 의미와 다르면 외부지식과 무관하게 반드시 FAIL (unconditional FAIL).",
    "   - QA는 원문 정답의 사실 여부를 검증하지 않는다. 외부 지식으로 '원문 정답이 틀렸다'거나 '생성 정답이 더 정확하다'고 판단해 생성 정답을 정당화할 수 없다.",
    "   - 원문 정답이 오답으로 이동하고 원문 오답이 정답으로 승격된 경우 반드시 FAIL.",
    "   - 생성 정답을 원문의 오답 보기와 '의미상 유사하다'는 이유만으로 PASS해서는 안 된다.",
    "C. 오답(distractor) 무결성: 원문 오답이 정답으로 승격되면 FAIL, 원문 정답이 선택지에서 사라지면 FAIL.",
    "   - 새 선택지가 추가되더라도 정답성을 훼손하거나 근거 없는 사실을 포함하면 FAIL.",
    "D. hallucination 판정: 원문(Source)에 없는 새로운 독립 사실을 추가하거나, 실제 사실관계·조건·정답성·질문 의도를 변경한 경우에만 기록한다.",
    "   - PASS 허용(신규 사실 추가 없음): 원문에 이미 있는 의미를 자연스럽게 풀어쓰기, 문장 순서 재구성, 동의어 치환, 문법적 연결어 추가, 생략된 주어/목적어의 단순 보충. 이들은 hallucination이 아니다.",
    "   - FAIL: Question/Choices/Explanation 어느 영역이든 원문에 존재하지 않는 다음 내용을 새로 추가하면 hallucination + critical flaw로 판단한다.",
    "     · 새로운 법령 내용, 법적 의무, 안전 행동요령, 안전수칙",
    "     · 새로운 원인-결과 관계, 사고 위험성, 평가적 판단",
    "     · 새로운 수치/기간, 조건/예외, 기술적 사실",
    "     · 원문에 없는 정답 근거, 외부 상식/도메인 지식을 이용한 Explanation 보강",
    "   - 추가한 내용이 현실 세계에서 사실이어도 원문에 없으면 source-grounded QA에서는 FAIL이다.",
    "   - hasHallucination은 위 기준으로 신규 사실 추가 또는 사실 변경이 있을 때만 true로 한다.",
    "E. 질문↔정답 일관성: '원문 질문 → 원문 정답'의 의미 구조가 '생성 질문 → 생성 정답'에 그대로 유지되는지 확인한다.",
    "   - 생성 질문과 생성 정답이 서로 맞더라도, 원문의 질문-정답 관계와 동일한 의미 구조가 아니면 FAIL.",
    "",
    "## 응답 규칙",
    "- 보기 순서는 원문과 다를 수 있다. answer는 번호(index)가 아닌 보기 텍스트로 '원문의 정답 보기'와 직접 대조한다. 원문의 다른 보기와 비교하지 않는다.",
    "- '원문의 정답 보기'의 의미가 생성된 선택지 중 적어도 하나에 보존되고, 그 보기가 생성 정답일 때만 answer_accuracy를 높게 판단한다.",
    "- answer_accuracy는 '원문의 정답 보기'와 생성 정답의 의미 보존 여부로만 평가한다. 외부 지식·상식으로 생성 정답을 옹호하거나 원문 정답을 반박하지 않는다.",
    "- 생성 정답이 원문의 오답 보기와 의미상 유사하더라도, '원문의 정답 보기'가 생성 보기에 보존되지 않았다면 answer_accuracy를 낮게 판단하고 criticalFlaws에 기록한다.",
    "- 필수 검수 규칙 A~E에 해당하면 반드시 criticalFlaws에 기록하고 pass=false로 한다.",
    "- criticalFlaws: 치명적 결함(환각/오답/복수 정답/원문 훼손/의도 변경/신규 지식 추가 등) 있으면 목록, 없으면 []",
    "- pass: criticalFlaws가 하나라도 있으면 반드시 false",
    "- hasHallucination: 원문에 없는 신규 사실을 추가하거나 원문 사실이 변경된 경우에만 true (표현 재구성·동의어 치환·단순 주어 보충은 false)",
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
