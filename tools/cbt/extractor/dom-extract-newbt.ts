// newbt.kr 전용 DOM Extractor (Session 10-1 STEP 4 source-specific 확장).
// 대상: newbt.kr 문제 상세 페이지 `/문제/{qid}`의 문제 container DOM.
//   - container: `div.blog-post.question`
//   - 문제 번호: `h5.subject > span.number` (예: "38.")
//   - 질문 본문: `h5.subject`에서 번호 span을 제외한 텍스트
//   - 보기: `ul.example > li` — 각 li의 `div.number`(번호+UI 체크 아이콘)는 제외
//   - 보기 번호: `span.circled`의 숫자 (파싱 불가 시 순서 1,2,3,... 사용)
//   - 정답: 원문 HTML에 없음 (별도 `GET /question/isAnswer/{qid}` — answerLocation: separate)
//   - 해설: 원문 HTML에 없음
// 원칙(제네릭 extractor와 동일):
//   - 원문 보존, 추측 금지. HTML에 없는 정보(answer/explanation)를 만들지 않는다.
//   - rawHtmlSnippet은 container 원본 HTML을 그대로 보존한다(No Drop).
//   - 매칭 실패 시 제네릭 extractor로 fallback한다.
import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ExtractedQuestion, SourceRef } from "../types";
import { extractImageAssets } from "./image-assets";
import { sanitizeText } from "./sanitize";
import { extractQuestionsFromHtml } from "./dom-extract";

/** newbt.kr 문제 container */
const NEWBT_QUESTION_CONTAINER = ".blog-post.question";
/** 문제 번호/질문 본문을 포함한 제목 요소 */
const NEWBT_SUBJECT_SELECTOR = "h5.subject";
/** 보기 목록 */
const NEWBT_CHOICE_LIST_SELECTOR = "ul.example>li";
/** 각 보기에서 번호 + UI 아이콘을 담은 영역 (질문 번호로도 사용됨) */
const NEWBT_NUMBER_SCHEMA_SELECTOR = ".number";
/** 보기 번호 표기 span */
const NEWBT_CIRCLED_SELECTOR = "span.circled";

export type ExtractNewbtQuestionInput = {
  html: Buffer | string;
  sourceName: string;
  sourceQuestionId: string;
  baseUrl?: string | null;
  sourceRef?: SourceRef;
};

function extractNewbtQuestionNumber($: CheerioAPI): {
  number: number | null;
  label: string | null;
} {
  const subject = $(NEWBT_SUBJECT_SELECTOR).first();
  if (subject.length === 0) return { number: null, label: null };
  const label = sanitizeText(
    subject.find(NEWBT_NUMBER_SCHEMA_SELECTOR).first().text(),
  );
  // "38." → 38 (추측 없이 HTML에 표기된 숫자만 사용)
  const m = label.match(/(\d{1,4})/);
  if (!m) return { number: null, label: label || null };
  return { number: Number.parseInt(m[1], 10), label: label || null };
}

function extractNewbtSubjectText($: CheerioAPI): string {
  const subject = $(NEWBT_SUBJECT_SELECTOR).first();
  if (subject.length === 0) return "";
  const clone = subject.clone();
  clone.find(NEWBT_NUMBER_SCHEMA_SELECTOR).remove();
  return sanitizeText(clone.text());
}

/**
 * newbt.kr 문제 HTML 1건에서 단일 문제를 추출한다.
 * container 매칭 실패 시 제네릭 extractor 첫 결과로 fallback한다.
 */
export function extractNewbtQuestion(
  input: ExtractNewbtQuestionInput,
): ExtractedQuestion {
  const $ = cheerio.load(input.html);
  const container = $(NEWBT_QUESTION_CONTAINER).first();

  if (container.length === 0) {
    const [fallback] = extractQuestionsFromHtml(input);
    return fallback;
  }

  // rawHtmlSnippet은 원본(수정 전) container innerHTML로 보존한다 (No Drop)
  const rawHtmlSnippet = $(container).html() || null;

  // 질문 번호/본문은 .number 제거 전에 먼저 확보한다 (h5.subject의 번호 span 포함)
  const { number: questionNumber } = extractNewbtQuestionNumber($);
  const questionText = extractNewbtSubjectText($);

  // 보기 번호 체크 아이콘/번호는 UI 컨트롤 → 텍스트·이미지 추출에서 제외한다.
  // 보기 번호는 span.circled 로 미리 읽은 뒤 .number 를 제거한다.
  const choiceIndexes: number[] = [];
  $(container)
    .find(NEWBT_CHOICE_LIST_SELECTOR)
    .each((_, el) => {
      const circled = $(el).find(NEWBT_CIRCLED_SELECTOR).first().text();
      const n = circled ? Number.parseInt(circled, 10) : Number.NaN;
      choiceIndexes.push(Number.isInteger(n) ? n : 0);
    });
  container.find(NEWBT_NUMBER_SCHEMA_SELECTOR).remove();

  const choiceEls: Cheerio<AnyNode>[] = [];
  const choices = $(container)
    .find(NEWBT_CHOICE_LIST_SELECTOR)
    .toArray()
    .map((el, i) => {
      choiceEls.push($(el));
      const text = sanitizeText($(el).text());
      const index =
        choiceIndexes[i] !== undefined && choiceIndexes[i] >= 1
          ? choiceIndexes[i]
          : i + 1;
      return { index, text };
    });

  const warnings: string[] = [];
  const images = extractImageAssets($, container, {
    baseUrl: input.baseUrl ?? null,
    choiceEls,
    explanationEl: null,
    containerConfirmed: true,
  }, warnings);

  // newbt.kr은 정답/해설을 HTML에 포함하지 않는다 (별도 API). 추측 금지.
  const rawAnswerText: string | null = null;
  const explanation: string | null = null;

  const sourceRef: SourceRef = {
    sourceName: input.sourceName,
    sourceQuestionId: input.sourceQuestionId,
    originalUrl: input.sourceRef?.originalUrl ?? null,
    fetchedAt: input.sourceRef?.fetchedAt ?? null,
    rawSourceFile: input.sourceRef?.rawSourceFile ?? "",
    rawBlockId: input.sourceRef?.rawBlockId ?? "",
    contentHash: input.sourceRef?.contentHash ?? "",
  };

  const questionTextOk = questionText.length > 0;
  const choicesOk = choices.length >= 2 && choices.length <= 5;
  const extractionStatus = questionTextOk && choicesOk ? "extracted" : "partial";
  if (!questionTextOk) warnings.push("질문 본문 추출 실패");
  if (!choicesOk) warnings.push("보기 추출 실패");

  return {
    sourceName: input.sourceName,
    sourceQuestionId: input.sourceQuestionId,
    sourceRef,
    rawHtmlSnippet,
    questionNumber,
    questionText,
    choices,
    rawAnswerText,
    explanation,
    images,
    extractionStatus,
    warnings,
  };
}