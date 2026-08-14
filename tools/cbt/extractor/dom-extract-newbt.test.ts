import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractNewbtQuestion } from "./dom-extract-newbt";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));
}

const newbtInput = {
  html: fixture("newbt-question.html"),
  sourceName: "NEWBT-HWMUL",
  // Collector가 urlTemplate {id}에 그대로 치환하는 raw qid (URL /문제/92628과 일치)
  sourceQuestionId: "92628",
  baseUrl: "https://newbt.kr",
  sourceRef: {
    sourceName: "NEWBT-HWMUL",
    sourceQuestionId: "92628",
    originalUrl: "https://newbt.kr/문제/92628",
    fetchedAt: "2026-08-14T00:00:00.000Z",
    rawSourceFile: "NEWBT-HWMUL/92628.html",
    rawBlockId: "",
    contentHash: "abc",
  },
};

describe("extractNewbtQuestion", () => {
  it("h5.subject .number에서 질문 번호를 추출한다", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.questionNumber).toBe(38);
  });

  it("질문 본문은 번호를 제외한 원문을 추출한다", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.questionText).toBe(
      "적재함 구조에 의한 화물자동차의 종류 중 합리화 특장차에 해당되는 것은 ?",
    );
  });

  it("보기 4개를 번호 prefix 없이 순서대로 추출한다", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.choices).toEqual([
      { index: 1, text: "분립체 수송차" },
      { index: 2, text: "실내하역기기 장비차" },
      { index: 3, text: "액체 수송차" },
      { index: 4, text: "카고 트럭" },
    ]);
  });

  it("UI 체크 아이콘(check-mark.png)은 이미지 metadata에서 제외한다", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.images).toEqual([]);
  });

  it("원문에 없는 정답/해설을 만들어 내지 않는다 (separate answer source)", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.rawAnswerText).toBeNull();
    expect(q.explanation).toBeNull();
  });

  it("rawHtmlSnippet은 container 원본 HTML을 보존한다 (No Drop)", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.rawHtmlSnippet).toContain('h5 class="subject"');
    expect(q.rawHtmlSnippet).toContain("check-mark.png");
    expect(q.rawHtmlSnippet).toContain("분립체 수송차");
  });

  it("extractionStatus는 extracted다", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.extractionStatus).toBe("extracted");
    expect(q.warnings).toEqual([]);
  });

  it("qid(92628)가 questionNumber로 오인되지 않는다", () => {
    const html = Buffer.from(
      `<!DOCTYPE html><html lang="ko"><body><div class="blog-post question">
        <a href="https://newbt.kr/question/view?qid=92628">문제 보기</a>
        <p>질문 본문입니다.</p>
        <ul class="example"><li>가</li><li>나</li><li>다</li><li>라</li></ul>
      </div></body></html>`,
    );
    const q = extractNewbtQuestion({ ...newbtInput, html });
    expect(q.questionNumber).toBeNull();
    expect(q.extractionStatus).toBe("partial");
  });

  it("질문 본문의 실제 이미지는 포함하고 UI 체크 아이콘은 제외한다", () => {
    const html = Buffer.from(
      `<!DOCTYPE html><html lang="ko"><body><div class="blog-post question">
        <h5 class="subject"><span class="number">38.</span> 도표를 보고 답하라.</h5>
        <p><img src="https://newbt.kr/question-img/diagram-92628.png" alt="하역 도표"></p>
        <ul class="example">
          <li><div class="number"><span class="circled">1</span><img src="/icon/check-mark.png"></div>분립체 수송차</li>
          <li><div class="number"><span class="circled">2</span><img src="/icon/check-mark.png"></div>실내하역기기 장비차</li>
          <li><div class="number"><span class="circled">3</span><img src="/icon/check-mark.png"></div>액체 수송차</li>
          <li><div class="number"><span class="circled">4</span><img src="/icon/check-mark.png"></div>카고 트럭</li>
        </ul>
      </div></body></html>`,
    );
    const q = extractNewbtQuestion({ ...newbtInput, html });
    expect(q.images.map((i) => i.src)).toEqual([
      "https://newbt.kr/question-img/diagram-92628.png",
    ]);
    expect(q.images[0].location).toBe("question");
  });

  it("container가 없으면 제네릭 extractor로 fallback한다", () => {
    const fallbackHtml = Buffer.from(
      `<div class="question"><p>보기가 있는 문제입니다.</p><ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>`,
    );
    const q = extractNewbtQuestion({ ...newbtInput, html: fallbackHtml });
    expect(q.extractionStatus).toBe("extracted");
    expect(q.choices).toHaveLength(4);
  });

  it("sourceRef를 pass-through한다", () => {
    const q = extractNewbtQuestion(newbtInput);
    expect(q.sourceRef.originalUrl).toBe("https://newbt.kr/문제/92628");
    expect(q.sourceRef.rawSourceFile).toBe("NEWBT-HWMUL/92628.html");
  });
});