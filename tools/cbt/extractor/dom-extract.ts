// DOM Extractor (Session 10-1 STEP 4 §10~§19).
// Raw HTML을 읽어 ExtractedQuestion으로 변환한다.
// - 원칙: 원문 보존, 추측 금지. 정답/해설/보기를 생성하지 않는다.
// - 정답은 숫자로 변환하지 않고 rawAnswerText로 원문 그대로 보존 (STEP 5가 정규화).
// - 만능 selector를 만들지 않는다. 현재는 공통 container 후보 + 텍스트/요소 fallback만 두고,
//   실제 Source HTML 확보 시 source-specific extractor로 확장한다.
// - 하나의 HTML에 여러 문제 container가 있으면 extractQuestionsFromHtml()이
//   파생 ID(원본-id)를 부여해 ExtractedQuestion[]로 반환한다.
import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  ExtractedChoice,
  ExtractedQuestion,
  ExtractionStatus,
  SourceRef,
} from "../types";
import { extractImageAssets } from "./image-assets";
import { sanitizeText } from "./sanitize";

const CIRCLE_TO_NUM: Record<string, number> = {
  "①": 1,
  "②": 2,
  "③": 3,
  "④": 4,
  "⑤": 5,
};

// question container 후보 (일반적인 구조만. Source 확정 후 확장 예정)
const CONTAINER_SELECTORS = [
  "[data-question]",
  ".question-container",
  ".question-body",
  ".question",
  ".problem",
  ".quiz-item",
  ".exam-question",
  ".cbt-question",
  '[class*="question"]',
  '[class*="problem"]',
];

const REMOVE_SELECTORS =
  "script, style, noscript, header, footer, nav, aside, form, button, iframe";

const ANSWER_ELEMENT_SELECTOR =
  '[data-answer], .answer, .answer-box, .answers, [class*="answer"], [class*="correct"]';

const EXPLANATION_ELEMENT_SELECTOR =
  '.explanation, .explain, .solution, [class*="explanation"], [class*="solution"], [class*="해설"]';

const CHOICE_CONTAINER_SELECTOR = ".options, .choices, .answers-list";

const ANSWER_LINE_RE = /^(?:정답|답|answer)\s*[:：=]?\s*(?:[①②③④⑤]|[1-5])/i;
const EXPLANATION_LINE_RE = /^(?:해설|풀이|explanation)\s*[:：]/i;

export type ExtractQuestionInput = {
  html: Buffer | string;
  sourceName: string;
  sourceQuestionId: string;
  baseUrl?: string | null;
  /** STEP 3 provenance. 제공되면 ExtractedQuestion.sourceRef로 pass-through한다 */
  sourceRef?: SourceRef;
};

// ---------------------------------------------------------------------------
// container
// ---------------------------------------------------------------------------

function findQuestionContainer(
  $: CheerioAPI,
): { container: Cheerio<AnyNode>; confirmed: boolean } {
  for (const selector of CONTAINER_SELECTORS) {
    const found = $(selector).first();
    if (found.length > 0) {
      return { container: found, confirmed: true };
    }
  }
  const body = $("body");
  return { container: body.length > 0 ? body : $.root(), confirmed: false };
}

/**
 * 하나의 HTML에서 발견된 모든 문제 container(leaf-most)를 문서 순서로 반환한다.
 * - CONTAINER_SELECTORS 우선순위 순으로 첫 매칭 selector의 요소들을 사용한다.
 * - 같은 selector가 부모/자식을 함께 잡는 경우(중첩)에는 자식(leaf)만 남긴다.
 * - 매칭이 하나도 없으면 빈 배열 (호출부에서 body fallback으로 단일 처리).
 * - 실제 Source 구조는 확정 전이므로 특정 구조에 의존하지 않는다.
 */
function findQuestionContainers($: CheerioAPI): Cheerio<AnyNode>[] {
  for (const selector of CONTAINER_SELECTORS) {
    const elements = $(selector).toArray();
    if (elements.length === 0) continue;
    const leaves = elements.filter((el) => {
      const ancestors = $(el).parents().toArray();
      return !ancestors.some((ancestor) => elements.includes(ancestor));
    });
    if (leaves.length > 0) {
      return leaves.map((el) => $(el));
    }
  }
  return [];
}

/**
 * 하나의 원본 sourceQuestionId에서 파생 ID를 만든다. 결정론적 규칙.
 * - questionNumber(HTML에서 실제 추출된 값)가 유효하면: 원본id-Q{n} (예: LAW-001-Q15)
 * - questionNumber가 없으면: 원본id-{index} (예: LAW-001-1)
 * questionNumber는 Extractor가 HTML에서 추출한 값만 사용한다 (추론/LLM 금지).
 */
export function deriveQuestionId(
  sourceQuestionId: string,
  questionNumber: number | null,
  index: number,
): string {
  if (
    questionNumber !== null &&
    Number.isInteger(questionNumber) &&
    questionNumber >= 1
  ) {
    return `${sourceQuestionId}-Q${questionNumber}`;
  }
  return `${sourceQuestionId}-${index}`;
}

// ---------------------------------------------------------------------------
// choices
// ---------------------------------------------------------------------------

function findChoiceElements(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
): Array<Cheerio<AnyNode>> | null {
  const preferred = $(container).find(`${CHOICE_CONTAINER_SELECTOR} li`);
  if (preferred.length >= 2 && preferred.length <= 5) {
    return preferred.toArray().map((el) => $(el));
  }
  const plain = $(container).find("li");
  if (plain.length >= 2 && plain.length <= 5) {
    return plain.toArray().map((el) => $(el));
  }
  return null;
}

function splitChoicePrefix(text: string): { index: number | null; body: string } {
  const circle = text.match(/^([①-⑤])\s*[:：.、．)）]*\s*(.*)$/);
  if (circle) {
    return { index: CIRCLE_TO_NUM[circle[1]] ?? null, body: sanitizeText(circle[2]) };
  }
  const num = text.match(/^([1-5])\s*[:：.、．)）]{1,2}\s*(.*)$/);
  if (num) {
    return { index: Number.parseInt(num[1], 10), body: sanitizeText(num[2]) };
  }
  return { index: null, body: sanitizeText(text) };
}

function buildChoices(
  items: string[],
  warnings: string[],
): ExtractedChoice[] {
  const parsed = items.map((item) => splitChoicePrefix(item));
  const sequential =
    parsed.every((p) => p.index !== null) &&
    parsed.every((p, i) => p.index === i + 1);

  if (sequential) {
    return parsed.map((p) => ({ index: p.index as number, text: p.body }));
  }

  const hasAnyIndex = parsed.some((p) => p.index !== null);
  if (hasAnyIndex) {
    warnings.push("선택지 번호 비연속/중복 — 순서대로 재번호");
  }
  return parsed.map((p, i) => ({ index: i + 1, text: p.body }));
}

function isChoiceLine(line: string): boolean {
  return /^[①-⑤]/.test(line) || /^[1-5][\s.:、．)）]/.test(line);
}

function extractChoicesFromLines(
  lines: string[],
  warnings: string[],
): { choices: ExtractedChoice[]; indexes: number[] } | null {
  const candidates: { idx: number; body: string }[] = [];
  lines.forEach((line, i) => {
    if (isChoiceLine(line)) {
      candidates.push({ idx: i, body: splitChoicePrefix(line).body });
    }
  });
  if (candidates.length < 2 || candidates.length > 5) return null;
  return {
    choices: buildChoices(
      candidates.map((c) => c.body),
      warnings,
    ),
    indexes: candidates.map((c) => c.idx),
  };
}

// ---------------------------------------------------------------------------
// answer / explanation (요소 기반 우선)
// ---------------------------------------------------------------------------

function extractAnswerFromElements(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
): string | null {
  const attrEl = $(container).find("[data-answer]").first();
  const attrVal = attrEl.attr("data-answer");
  if (attrVal !== undefined && attrVal.trim().length > 0) {
    return sanitizeText(attrVal);
  }
  const elText = $(container).find(ANSWER_ELEMENT_SELECTOR).first().text();
  if (elText && elText.trim().length > 0) {
    return sanitizeText(elText);
  }
  return null;
}

function extractExplanationFromElements(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
): { el: Cheerio<AnyNode>; text: string } | null {
  const el = $(container).find(EXPLANATION_ELEMENT_SELECTOR).first();
  if (el.length === 0) return null;
  const text = sanitizeText(el.text());
  if (!text) return null;
  return { el, text: text.replace(/^해설\s*[:：]?\s*/, "") };
}

// ---------------------------------------------------------------------------
// 텍스트 라인 추출 (요소 기반으로 못 잡은 문제/보기/정답/해설의 fallback)
// ---------------------------------------------------------------------------

function extractTextLines(
  $: CheerioAPI,
  root: Cheerio<AnyNode>,
): string[] {
  const clone = $(root).clone();
  clone.find(REMOVE_SELECTORS).remove();
  clone.find("br").replaceWith("\n");
  clone
    .find(
      "p, div, li, tr, td, th, h1, h2, h3, h4, h5, table, ul, ol, section, article",
    )
    .each((_, el) => {
      $(el).append("\n");
    });
  const text = clone.text();
  return text
    .split("\n")
    .map((line) => sanitizeText(line))
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// question number
// ---------------------------------------------------------------------------

type QuestionNumberResult = {
  number: number | null;
  /** HTML에서 직접 추출되었는지. false면 sourceQuestionId fallback(추측) */
  fromHtml: boolean;
};

function extractQuestionNumber(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  sourceQuestionId: string,
): QuestionNumberResult {
  const attrEl = $(
    container,
  ).find("[data-question-number], [data-no], [data-qnum]").first();
  const attrVal =
    attrEl.attr("data-question-number") ??
    attrEl.attr("data-no") ??
    attrEl.attr("data-qnum");
  if (attrVal !== undefined) {
    const n = Number.parseInt(attrVal, 10);
    if (Number.isInteger(n)) return { number: n, fromHtml: true };
  }

  const headingEl = $(
    container,
  ).find(".question-number, .q-number, h1, h2, h3, h4").first();
  const headingText = sanitizeText(headingEl.text());
  if (headingText) {
    const m = headingText.match(/(?:문제\s*)?(\d{1,3})\s*[번.]/);
    if (m) return { number: Number.parseInt(m[1], 10), fromHtml: true };
    const m2 = headingText.match(/(\d{1,3})$/);
    if (m2) return { number: Number.parseInt(m2[1], 10), fromHtml: true };
  }

  // 식별 보조용: HTML 본문 번호가 없을 때 sourceQuestionId("LAW-001" → 1)
  // fromHtml=false — ID 생성에는 사용하지 않는다 (추측이므로)
  const idMatch = sourceQuestionId.match(/(\d+)$/);
  if (idMatch) {
    return { number: Number.parseInt(idMatch[1], 10), fromHtml: false };
  }

  return { number: null, fromHtml: false };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

/**
 * 문제 container 1개를 ExtractedQuestion으로 추출한다 (공용 로직).
 * 원문을 수정하지 않으며, 원문에 없는 정보를 생성하지 않는다.
 * confirmed=false(body fallback)면 그 사유를 warnings에 기록한다.
 */
function extractFromContainer(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  confirmed: boolean,
  input: ExtractQuestionInput,
): ExtractedQuestion {
  const warnings: string[] = [];
  if (!confirmed) {
    warnings.push("question container 미확정 — body fallback 사용");
  }
  const baseUrl = input.baseUrl ?? null;

  // choices (요소 기반: li)
  const choiceEls = findChoiceElements($, container);
  const liBased = choiceEls !== null;
  let choices: ExtractedChoice[] | null = null;
  if (choiceEls) {
    const texts = choiceEls.map((el) => {
      const text = sanitizeText($(el).text());
      if (text.length === 0) {
        warnings.push("choice 텍스트 없음 (이미지 전용 보기일 수 있음)");
      }
      return text;
    });
    choices = buildChoices(texts, warnings);
  }

  // answer / explanation (요소 기반)
  let rawAnswerText = extractAnswerFromElements($, container);
  const explanationResult = extractExplanationFromElements($, container);
  let explanation = explanationResult?.text ?? null;

  // 텍스트 라인 (choice/answer/explanation 요소 제거 후)
  const clone = $(container).clone();
  clone.find(REMOVE_SELECTORS).remove();
  if (liBased) clone.find("li").remove();
  clone.find(ANSWER_ELEMENT_SELECTOR).remove();
  clone.find(EXPLANATION_ELEMENT_SELECTOR).remove();
  const lines = extractTextLines($, clone);
  const excluded = new Set<number>();

  // choices (라인 기반 fallback)
  if (choices === null) {
    const lineChoices = extractChoicesFromLines(lines, warnings);
    if (lineChoices) {
      choices = lineChoices.choices;
      lineChoices.indexes.forEach((i) => excluded.add(i));
    }
  }

  // answer / explanation (라인 기반 fallback)
  const answerLineIdx = lines.findIndex((line) => ANSWER_LINE_RE.test(line));
  if (answerLineIdx >= 0) {
    if (rawAnswerText === null) rawAnswerText = sanitizeText(lines[answerLineIdx]);
    excluded.add(answerLineIdx);
  }
  if (explanation === null) {
    const explanationLineIdx = lines.findIndex((line) =>
      EXPLANATION_LINE_RE.test(line),
    );
    if (explanationLineIdx >= 0) {
      explanation = sanitizeText(
        lines
          .slice(explanationLineIdx)
          .join("\n")
          .replace(/^해설\s*[:：]?\s*/, ""),
      );
      for (let i = explanationLineIdx; i < lines.length; i += 1) {
        excluded.add(i);
      }
    }
  }

  const questionLines = lines.filter((_, i) => !excluded.has(i));
  const questionText = sanitizeText(questionLines.join("\n"));

  // 이미지
  const images = extractImageAssets(
    $,
    container,
    {
      baseUrl,
      choiceEls: choiceEls ?? [],
      explanationEl: explanationResult?.el ?? null,
      containerConfirmed: confirmed,
    },
    warnings,
  );

  const questionNumber = extractQuestionNumber($, container, input.sourceQuestionId);

  // STEP 3 provenance pass-through. 원본 값을 재구성/추측하지 않는다.
  const sourceRef: SourceRef = {
    sourceName: input.sourceName,
    sourceQuestionId: input.sourceQuestionId,
    originalUrl: input.sourceRef?.originalUrl ?? null,
    fetchedAt: input.sourceRef?.fetchedAt ?? null,
    rawSourceFile: input.sourceRef?.rawSourceFile ?? "",
    rawBlockId: input.sourceRef?.rawBlockId ?? "",
    contentHash: input.sourceRef?.contentHash ?? "",
  };

  // rawHtmlSnippet: 문제 영역 container의 innerHTML을 그대로 보존한다.
  // container 미확정(body fallback) 시에도 No Drop 원칙에 따라 원본 HTML을
  // snippet으로 남겨 증거 추적을 가능하게 한다 (파싱 실패 데이터 소멸 방지).
  const rawHtmlSnippet = $(container).html() || null;

  let extractionStatus: ExtractionStatus;
  if (questionText.length === 0) {
    extractionStatus = "failed";
  } else if (choices !== null && choices.length >= 2 && choices.length <= 5) {
    extractionStatus = "extracted";
  } else {
    extractionStatus = "partial";
    if (choices === null || choices.length === 0) {
      warnings.push("choices 미확정 — 보기 추출 실패");
    } else if (choices.length > 5) {
      warnings.push("choices 과다");
    }
  }

  return {
    sourceName: input.sourceName,
    sourceQuestionId: input.sourceQuestionId,
    sourceRef,
    rawHtmlSnippet,
    questionNumber: questionNumber.number,
    questionText,
    choices: choices ?? [],
    rawAnswerText,
    explanation,
    images,
    extractionStatus,
    warnings,
  };
}

/**
 * Raw HTML 1건에서 단일 문제를 추출한다 (기존 동작 유지).
 * 첫 매칭 container만 사용한다. 원문을 수정하지 않으며,
 * 원문에 없는 정보를 생성하지 않는다.
 */
export function extractQuestionFromHtml(
  input: ExtractQuestionInput,
): ExtractedQuestion {
  const $ = cheerio.load(input.html);
  const { container, confirmed } = findQuestionContainer($);
  return extractFromContainer($, container, confirmed, input);
}

/**
 * Raw HTML 1건에서 모든 문제 container를 추출한다 (multi-question 지원).
 * - container가 여러 개면 파생 ID를 부여한다. 우선순위:
 *   1. container에서 HTML로 추출된 questionNumber가 유효하면 LAW-001-Q15 형태
 *   2. questionNumber가 없으면 LAW-001-1 / LAW-001-2 / ... (index fallback)
 * - container가 1개이거나 매칭이 없으면 원본 sourceQuestionId를 그대로 유지한다.
 * - 파생 ID 규칙은 결정론적이며 같은 HTML을 재실행해도 동일하다.
 * - 동일 questionNumber로 파생 ID가 중복되면 warning에 남긴다 (충돌 은닉 금지).
 * - rawHtmlSnippet은 container별 string | null로 유지한다 (STEP 6 전 파일 저장/ID 변환 없음).
 * - Raw HTML을 수정하지 않는다. 원문에 없는 정보를 생성하지 않는다.
 */
export function extractQuestionsFromHtml(
  input: ExtractQuestionInput,
): ExtractedQuestion[] {
  const $ = cheerio.load(input.html);
  const containers = findQuestionContainers($);

  if (containers.length === 0) {
    const { container, confirmed } = findQuestionContainer($);
    return [extractFromContainer($, container, confirmed, input)];
  }

  if (containers.length === 1) {
    return [extractFromContainer($, containers[0], true, input)];
  }

  const results = containers.map((container, index) => {
    const qn = extractQuestionNumber($, container, input.sourceQuestionId);
    const derivedId = deriveQuestionId(
      input.sourceQuestionId,
      qn.fromHtml ? qn.number : null,
      index + 1,
    );
    return extractFromContainer($, container, true, {
      ...input,
      sourceQuestionId: derivedId,
    });
  });

  // 동일 questionNumber가 여러 번 등장해 파생 ID가 중복되면 경고로 드러낸다 (충돌 은닉 금지)
  const idCounts = new Map<string, number>();
  for (const result of results) {
    idCounts.set(result.sourceQuestionId, (idCounts.get(result.sourceQuestionId) ?? 0) + 1);
  }
  for (const result of results) {
    if ((idCounts.get(result.sourceQuestionId) ?? 0) > 1) {
      result.warnings.push(
        `파생 sourceQuestionId 중복 (동일 questionNumber?) — ${result.sourceQuestionId}`,
      );
    }
  }

  return results;
}
