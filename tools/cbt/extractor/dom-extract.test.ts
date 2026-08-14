import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveQuestionId,
  extractQuestionFromHtml,
  extractQuestionsFromHtml,
} from "./dom-extract";
import type { ExtractQuestionInput } from "./dom-extract";

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
}

const baseInput = (
  html: Buffer | string,
  extra: Partial<ExtractQuestionInput> = {},
): ExtractQuestionInput => ({
  html,
  sourceName: "LAW",
  sourceQuestionId: "LAW-001",
  ...extra,
});

describe("extractQuestionFromHtml", () => {
  it("1. 단순 문제 + 4개 보기를 추출한다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-a.html")));
    expect(result.extractionStatus).toBe("extracted");
    expect(result.choices).toHaveLength(4);
    expect(result.choices[0]).toEqual({ index: 1, text: "운전면허가 즉시 취소된다" });
    expect(result.choices[3]).toEqual({
      index: 4,
      text: "사업용 화물차는 예외로 처벌하지 않는다",
    });
    expect(result.questionText).toContain("최대적재량을 초과하여");
  });

  it("2. 정답을 숫자로 변환하지 않고 원문 그대로 추출한다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-a.html")));
    expect(result.rawAnswerText).toBe("정답: ③");
    expect(result.rawAnswerText).not.toBe(3);
  });

  it("3. 해설을 추출한다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-a.html")));
    expect(result.explanation).toContain("과적 운행은");
    expect(result.explanation).toContain("행정처분");
  });

  it("4. 정답/해설이 없는 문제는 null로 둔다", () => {
    const html = `<div class="question">
      <p>보기가 있는 문제입니다.</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol>
    </div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.rawAnswerText).toBeNull();
    expect(result.explanation).toBeNull();
    expect(result.extractionStatus).toBe("extracted");
  });

  it("5. HTML entity / whitespace를 정리한다", () => {
    const html = `<div class="question">
      <p>화물자동차의&nbsp;&nbsp;최대적재량은?</p>
      <ol class="options"><li>1&nbsp;톤 이하</li><li>1&nbsp;톤 초과</li><li>2&nbsp;톤 이하</li><li>2&nbsp;톤 초과</li></ol>
    </div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.questionText).toBe("화물자동차의 최대적재량은?");
    expect(result.choices[0].text).toBe("1 톤 이하");
    expect(result.questionText).not.toContain("\u00a0");
  });

  it("6. ①②③④ 형태 보기를 추출한다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-a.html")));
    expect(result.choices.map((c) => c.index)).toEqual([1, 2, 3, 4]);
    expect(result.choices[1].text).toBe("과태료·벌점 등 행정처분을 받을 수 있다");
  });

  it("7. 1/2/3/4 형태 보기를 추출한다", () => {
    const html = `<div class="question">
      <p>정답은?</p>
      <p>1. 첫 번째</p>
      <p>2. 두 번째</p>
      <p>3. 세 번째</p>
      <p>4. 네 번째</p>
    </div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.choices).toHaveLength(4);
    expect(result.choices[0]).toEqual({ index: 1, text: "첫 번째" });
    expect(result.questionText).toBe("정답은?");
  });

  it("8. 이미지 metadata를 추출한다 (src/alt/index)", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-c.html")));
    expect(result.images).toHaveLength(3);
    expect(result.images[0]).toMatchObject({
      src: "/images/sign1.png",
      alt: "교통표지",
      index: 0,
      originalSrc: "/images/sign1.png",
      width: 120,
      height: 80,
    });
    expect(result.images[1].alt).toBeNull();
  });

  it("9. 상대 이미지 URL을 base URL로 resolve한다", () => {
    const result = extractQuestionFromHtml(
      baseInput(fixture("fixture-c.html"), {
        baseUrl: "https://example.test/questions/LAW-001.html",
      }),
    );
    const sign = result.images.find((img) => img.originalSrc === "/images/sign1.png");
    expect(sign?.resolvedSrc).toBe("https://example.test/images/sign1.png");
    expect(sign?.src).toBe("https://example.test/images/sign1.png");
  });

  it("10. question 영역 이미지의 location은 question이다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-c.html")));
    const sign = result.images.find((img) => img.originalSrc === "/images/sign1.png");
    expect(sign?.location).toBe("question");
  });

  it("11. 보기 이미지의 location은 choice_N이다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-c.html")));
    const opt = result.images.find((img) => img.originalSrc === "/images/opt1.png");
    expect(opt?.location).toBe("choice_1");
  });

  it("12. 해설 이미지의 location은 explanation이다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-c.html")));
    const exp = result.images.find((img) => img.originalSrc === "/images/exp1.png");
    expect(exp?.location).toBe("explanation");
  });

  it("13. 복수 정답 원문을 그대로 보존한다", () => {
    const html = `<div class="question">
      <p>다음을 모두 고르시오.</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol>
      <div class="answer">정답: 1, 3</div>
    </div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.rawAnswerText).toBe("정답: 1, 3");
  });

  it("14. malformed HTML도 예외 없이 최대한 추출한다", () => {
    const malformed = `<div class="question"><p>화물차 운전자의 휴게시간은?<ul><li>30분</li><li>1시간</li><li>2시간</li><li>3시간`;
    const result = extractQuestionFromHtml(baseInput(malformed));
    expect(result.questionText.length).toBeGreaterThan(0);
  });

  it("15. 보기가 없는 문제는 partial로 처리한다", () => {
    const html = `<div class="question"><p>보기가 없는 문제입니다.</p></div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.extractionStatus).toBe("partial");
    expect(result.warnings.some((w) => w.includes("choices"))).toBe(true);
  });

  it("16. questionText + choices가 있으면 extracted다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-b.html")));
    expect(result.extractionStatus).toBe("extracted");
    expect(result.choices).toHaveLength(4);
  });

  it("17. 문제 텍스트가 없으면 failed로 처리한다", () => {
    const html = `<div class="question"><!-- 비어 있음 --></div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.extractionStatus).toBe("failed");
  });

  it("18. 원문 HTML이 변경되지 않는다", () => {
    const html = fixture("fixture-a.html");
    const buffer = Buffer.from(html);
    extractQuestionFromHtml(baseInput(html));
    extractQuestionFromHtml(baseInput(buffer));
    expect(html).toBe(fixture("fixture-a.html"));
    expect(buffer.toString("utf8")).toBe(fixture("fixture-a.html"));
  });

  it("19. rawHtmlSnippet에 문제 영역 HTML이 보존된다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-b.html")));
    expect(result.rawHtmlSnippet).not.toBeNull();
    expect(result.rawHtmlSnippet).toContain('class="options"');
    expect(result.rawHtmlSnippet).toContain("<li>");
  });

  it("20. question container 미확정 시 이미지 location은 unknown이다", () => {
    const html = `<div class="page"><p>내용</p><img src="https://cdn.example.com/x.png" alt="x"></div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.images[0].location).toBe("unknown");
    // No Drop: container 미확정이어도 원본 HTML snippet은 보존한다
    expect(result.rawHtmlSnippet).not.toBeNull();
    expect(result.rawHtmlSnippet).toContain("cdn.example.com/x.png");
  });

  it("N1. 파싱 실패(failed)여도 ExtractedQuestion과 원본 HTML snippet이 보존된다 (No Drop)", () => {
    const html = `<div class="page"><img src="https://cdn.example.com/x.png" alt="x"></div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.extractionStatus).toBe("failed");
    expect(result.rawHtmlSnippet).not.toBeNull();
    expect(result.rawHtmlSnippet).toContain("cdn.example.com/x.png");
  });

  it("N2. partial 추출도 rawHtmlSnippet을 보존한다 (No Drop)", () => {
    const html = `<div class="page"><p>파싱 불가 텍스트</p></div>`;
    const result = extractQuestionFromHtml(baseInput(html));
    expect(result.extractionStatus).toBe("partial");
    expect(result.rawHtmlSnippet).toContain("파싱 불가 텍스트");
  });

  it("questionNumber를 heading에서 추출한다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-a.html")));
    expect(result.questionNumber).toBe(1);
  });

  it("questionNumber는 sourceQuestionId를 보조 식별자로 사용한다", () => {
    const html = `<div class="question"><p>번호 없는 문제입니다.</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>`;
    const result = extractQuestionFromHtml(
      baseInput(html, { sourceQuestionId: "LAW-042" }),
    );
    expect(result.questionNumber).toBe(42);
  });

  it("STEP 3 provenance(sourceRef)를 그대로 pass-through한다", () => {
    const result = extractQuestionFromHtml(
      baseInput(fixture("fixture-a.html"), {
        sourceRef: {
          sourceName: "LAW",
          sourceQuestionId: "LAW-001",
          originalUrl: "https://example.test/questions/LAW-001.html",
          fetchedAt: "2026-08-13T01:02:03.000Z",
          rawSourceFile: "LAW/LAW-001.html",
          rawBlockId: "",
          contentHash: "feedface",
        },
      }),
    );
    expect(result.sourceRef.originalUrl).toBe(
      "https://example.test/questions/LAW-001.html",
    );
    expect(result.sourceRef.fetchedAt).toBe("2026-08-13T01:02:03.000Z");
    expect(result.sourceRef.rawSourceFile).toBe("LAW/LAW-001.html");
    expect(result.sourceRef.contentHash).toBe("feedface");
    expect(result.sourceRef.sourceName).toBe("LAW");
    expect(result.sourceRef.sourceQuestionId).toBe("LAW-001");
  });

  it("sourceRef 미제공 시 provenance 필드는 null/빈 값으로 둔다", () => {
    const result = extractQuestionFromHtml(baseInput(fixture("fixture-a.html")));
    expect(result.sourceRef.originalUrl).toBeNull();
    expect(result.sourceRef.fetchedAt).toBeNull();
    expect(result.sourceRef.sourceName).toBe("LAW");
    expect(result.sourceRef.sourceQuestionId).toBe("LAW-001");
  });
});

describe("extractQuestionsFromHtml — multi-question", () => {
  it("M1. 여러 문제 container를 모두 추출한다", () => {
    const results = extractQuestionsFromHtml(baseInput(fixture("multi-question.html")));
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.extractionStatus === "extracted")).toBe(true);
  });

  it("M2. 파생 ID 규칙: HTML questionNumber 사용 → LAW-001-Q1 / Q2 / Q3", () => {
    const results = extractQuestionsFromHtml(baseInput(fixture("multi-question.html")));
    expect(results.map((r) => r.sourceQuestionId)).toEqual([
      "LAW-001-Q1",
      "LAW-001-Q2",
      "LAW-001-Q3",
    ]);
  });

  it("M3. 각 문제는 서로 다른 내용을 가진다", () => {
    const results = extractQuestionsFromHtml(baseInput(fixture("multi-question.html")));
    expect(results[0].questionText).toContain("첫 번째 문제");
    expect(results[1].questionText).toContain("두 번째 문제");
    expect(results[2].questionText).toContain("세 번째 문제");
    expect(results[0].questionNumber).toBe(1);
    expect(results[1].questionNumber).toBe(2);
    expect(results[2].questionNumber).toBe(3);
  });

  it("M4. 각 문제의 rawAnswerText가 유지된다", () => {
    const results = extractQuestionsFromHtml(baseInput(fixture("multi-question.html")));
    expect(results[0].rawAnswerText).toBe("정답: ②");
    expect(results[1].rawAnswerText).toBe("정답: ①");
    expect(results[2].rawAnswerText).toBe("정답: ①");
  });

  it("M5. 같은 HTML을 재실행해도 동일한 ID를 생성한다 (결정론적)", () => {
    const input = baseInput(fixture("multi-question.html"));
    const a = extractQuestionsFromHtml(input);
    const b = extractQuestionsFromHtml(input);
    expect(a.map((r) => r.sourceQuestionId)).toEqual(b.map((r) => r.sourceQuestionId));
    expect(a[0].questionText).toBe(b[0].questionText);
  });

  it("M6. container별 rawHtmlSnippet을 string으로 유지한다", () => {
    const results = extractQuestionsFromHtml(baseInput(fixture("multi-question.html")));
    for (const result of results) {
      expect(result.rawHtmlSnippet).not.toBeNull();
      expect(typeof result.rawHtmlSnippet).toBe("string");
      expect(result.rawHtmlSnippet).toContain("문제");
    }
    // 서로 다른 container의 snippet은 다르다
    expect(results[0].rawHtmlSnippet).not.toBe(results[1].rawHtmlSnippet);
  });

  it("M7. 원본 Raw HTML은 변경되지 않는다", () => {
    const html = fixture("multi-question.html");
    const buffer = Buffer.from(html);
    extractQuestionsFromHtml(baseInput(html));
    extractQuestionsFromHtml(baseInput(buffer));
    expect(html).toBe(fixture("multi-question.html"));
    expect(buffer.toString("utf8")).toBe(fixture("multi-question.html"));
  });
});

describe("extractQuestionsFromHtml — 단일 문제", () => {
  it("M8. container가 1개면 원본 sourceQuestionId를 유지한다", () => {
    const results = extractQuestionsFromHtml(baseInput(fixture("fixture-a.html")));
    expect(results).toHaveLength(1);
    expect(results[0].sourceQuestionId).toBe("LAW-001");
    expect(results[0].rawAnswerText).toBe("정답: ③");
  });

  it("M9. container가 없으면 body fallback으로 단일 결과 + 원본 ID + 경고", () => {
    const html = `<div class="page"><p>내용</p><img src="https://cdn.example.com/x.png" alt="x"></div>`;
    const results = extractQuestionsFromHtml(baseInput(html));
    expect(results).toHaveLength(1);
    expect(results[0].sourceQuestionId).toBe("LAW-001");
    expect(results[0].warnings.some((w) => w.includes("container 미확정"))).toBe(true);
    // No Drop: body fallback이어도 원본 HTML snippet은 보존한다
    expect(results[0].rawHtmlSnippet).not.toBeNull();
    expect(results[0].rawHtmlSnippet).toContain("cdn.example.com/x.png");
  });
});

describe("deriveQuestionId", () => {
  it("M10. questionNumber가 있으면 Q 기반 파생 ID를 만든다", () => {
    expect(deriveQuestionId("LAW-001", 15, 1)).toBe("LAW-001-Q15");
    expect(deriveQuestionId("LAW-001", 15, 2)).toBe("LAW-001-Q15");
    expect(deriveQuestionId("LAW-001", 7, 3)).toBe("LAW-001-Q7");
  });

  it("M11. questionNumber가 없으면 index 기반 파생 ID를 만든다", () => {
    expect(deriveQuestionId("LAW-001", null, 1)).toBe("LAW-001-1");
    expect(deriveQuestionId("LAW-001", null, 2)).toBe("LAW-001-2");
    expect(deriveQuestionId("LAW-001", null, 3)).toBe("LAW-001-3");
  });

  it("M12. 같은 입력은 항상 같은 결과를 반환한다 (결정론적)", () => {
    expect(deriveQuestionId("HANDLING-012", 15, 1)).toBe(
      deriveQuestionId("HANDLING-012", 15, 1),
    );
  });

  it("M13. 동일 source URL + 서로 다른 questionNumber → 서로 다른 sourceQuestionId", () => {
    const html = `<div class="question"><h3>문제 15</h3><p>15번?</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>
      <div class="question"><h3>문제 16</h3><p>16번?</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>`;
    const results = extractQuestionsFromHtml(baseInput(html));
    expect(results.map((r) => r.sourceQuestionId)).toEqual([
      "LAW-001-Q15",
      "LAW-001-Q16",
    ]);
    expect(new Set(results.map((r) => r.sourceQuestionId)).size).toBe(2);
  });

  it("M14. HTML 번호가 없으면 index fallback 파생 ID를 사용한다", () => {
    const html = `<div class="question"><p>첫 문제?</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>
      <div class="question"><p>둘째 문제?</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>`;
    const results = extractQuestionsFromHtml(baseInput(html));
    expect(results.map((r) => r.sourceQuestionId)).toEqual([
      "LAW-001-1",
      "LAW-001-2",
    ]);
  });

  it("M15. 동일 questionNumber로 파생 ID가 중복되면 경고를 남긴다 (충돌 은닉 금지)", () => {
    const html = `<div class="question"><h3>문제 1</h3><p>첫 문제?</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>
      <div class="question"><h3>문제 1</h3><p>둘째 문제?</p>
      <ol class="options"><li>가</li><li>나</li><li>다</li><li>라</li></ol></div>`;
    const results = extractQuestionsFromHtml(baseInput(html));
    expect(results.map((r) => r.sourceQuestionId)).toEqual([
      "LAW-001-Q1",
      "LAW-001-Q1",
    ]);
    for (const result of results) {
      expect(
        result.warnings.some((w) => w.includes("sourceQuestionId 중복")),
      ).toBe(true);
    }
  });
});
