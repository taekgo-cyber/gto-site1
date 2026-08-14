import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "./normalize-question";
import type { ExtractedQuestion } from "../types";

const SNIPPET = '<div class="question"><h3>문제 1</h3><p>본문</p></div>';

function makeQuestion(
  overrides: Partial<ExtractedQuestion> = {},
): ExtractedQuestion {
  return {
    sourceName: "LAW",
    sourceQuestionId: "LAW-001",
    sourceRef: {
      sourceName: "LAW",
      sourceQuestionId: "LAW-001",
      originalUrl: "https://example.test/questions/LAW-001.html",
      fetchedAt: "2026-08-13T00:00:00.000Z",
      rawSourceFile: "LAW/LAW-001.html",
      rawBlockId: "",
      contentHash: "abc123",
    },
    rawHtmlSnippet: SNIPPET,
    questionNumber: 1,
    questionText:
      "화물자동차의 최대적재량을 초과하여 화물을 운송한 경우에 대한 설명으로 올바른 것은?",
    choices: [
      { index: 1, text: "운전면허가 즉시 취소된다" },
      { index: 2, text: "과태료·벌점 등 행정처분을 받을 수 있다" },
      { index: 3, text: "아무런 제재가 없다" },
      { index: 4, text: "사업용 화물차는 예외로 처벌하지 않는다" },
    ],
    rawAnswerText: "정답: ③",
    explanation: "과적 운행은 도로 파손과 안전사고의 원인이므로 행정처분 대상입니다.",
    images: [],
    extractionStatus: "extracted",
    warnings: [],
    ...overrides,
  };
}

describe("normalizeQuestion — validation status", () => {
  it("19. 정상 문제 → VALID", () => {
    const result = normalizeQuestion(makeQuestion());
    expect(result.validationStatus).toBe("VALID");
    expect(result.normalizedAnswers).toEqual([3]);
    expect(result.validationErrors).toEqual([]);
  });

  it("정상 문제 + 소스 category는 CAT-LAW로 남는다", () => {
    const result = normalizeQuestion(makeQuestion());
    expect(result.category).toBe("CAT-LAW");
    expect(result.classificationMethod).toBe("source");
  });

  it("20. 정답 없음 → REVIEW_REQUIRED (answer_missing)", () => {
    const result = normalizeQuestion(makeQuestion({ rawAnswerText: null }));
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
    expect(result.validationErrors).toContain("answer_missing");
    expect(result.normalizedAnswers).toEqual([]);
  });

  it("21. 정답 index 초과([5], 보기 4개) → REVIEW_REQUIRED", () => {
    const result = normalizeQuestion(
      makeQuestion({ rawAnswerText: "정답: ⑤" }),
    );
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
    expect(
      result.validationErrors.some((e) => e.startsWith("answer_out_of_range")),
    ).toBe(true);
  });

  it("22. questionText 없음 → REJECTED", () => {
    const result = normalizeQuestion(makeQuestion({ questionText: "   " }));
    expect(result.validationStatus).toBe("REJECTED");
    expect(result.validationErrors).toContain("question_text_missing");
  });

  it("23. choices 없음 → REVIEW_REQUIRED (데이터 보존)", () => {
    const result = normalizeQuestion(makeQuestion({ choices: [] }));
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
    expect(result.validationErrors).toContain("choices_missing");
  });

  it("24. extractionStatus = failed → REJECTED", () => {
    const result = normalizeQuestion(
      makeQuestion({ extractionStatus: "failed" }),
    );
    expect(result.validationStatus).toBe("REJECTED");
    expect(result.validationErrors).toContain("extraction_failed");
  });

  it("partial + 정답 없음 → REVIEW_REQUIRED (두 상태 유지)", () => {
    const result = normalizeQuestion(
      makeQuestion({ extractionStatus: "partial", rawAnswerText: null }),
    );
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
  });
});

describe("normalizeQuestion — provenance / no drop", () => {
  it("35. sourceName 유지", () => {
    expect(normalizeQuestion(makeQuestion()).sourceRef.sourceName).toBe("LAW");
  });

  it("36. sourceQuestionId 유지", () => {
    expect(normalizeQuestion(makeQuestion()).sourceRef.sourceQuestionId).toBe(
      "LAW-001",
    );
  });

  it("37. rawHtmlSnippet reference 유지", () => {
    const input = makeQuestion();
    const result = normalizeQuestion(input);
    expect(result.sourceRef.rawHtmlSnippetId).toBeNull();
    // 원본 ExtractedQuestion의 rawHtmlSnippet은 변경되지 않는다
    expect(input.rawHtmlSnippet).toBe(SNIPPET);
  });

  it("38. 검증 실패 record가 결과에서 사라지지 않는다", () => {
    const question = makeQuestion({ choices: [], rawAnswerText: null });
    const result = normalizeQuestion(question);
    expect(result.choices).toEqual([]);
    expect(result.normalizedAnswers).toEqual([]);
    expect(result.questionText.length).toBeGreaterThan(0);
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
  });

  it("원문 텍스트를 수정하지 않는다 (pass-through)", () => {
    const question = makeQuestion();
    const result = normalizeQuestion(question);
    expect(result.questionText).toBe(question.questionText);
    expect(result.choices).toEqual(question.choices);
    expect(result.explanation).toBe(question.explanation);
    expect(result.questionNumber).toBe(question.questionNumber);
  });

  it("multi-question HTML은 map으로 처리한다", () => {
    const q1 = makeQuestion({
      sourceQuestionId: "LAW-001",
      sourceRef: {
        sourceName: "LAW",
        sourceQuestionId: "LAW-001",
        originalUrl: "https://example.test/questions/LAW-001.html",
        fetchedAt: "2026-08-13T00:00:00.000Z",
        rawSourceFile: "LAW/LAW-001.html",
        rawBlockId: "",
        contentHash: "abc123",
      },
    });
    const q2 = makeQuestion({
      sourceQuestionId: "LAW-002",
      sourceRef: {
        sourceName: "LAW",
        sourceQuestionId: "LAW-002",
        originalUrl: "https://example.test/questions/LAW-002.html",
        fetchedAt: "2026-08-13T00:00:00.000Z",
        rawSourceFile: "LAW/LAW-002.html",
        rawBlockId: "",
        contentHash: "abc456",
      },
      questionText: "두 번째 문제 질문",
      rawAnswerText: "정답: ①",
    });
    const results = [q1, q2].map((q) => normalizeQuestion(q));
    expect(results).toHaveLength(2);
    expect(results[0].sourceRef.sourceQuestionId).toBe("LAW-001");
    expect(results[1].sourceRef.sourceQuestionId).toBe("LAW-002");
  });
});

describe("normalizeQuestion — STEP 6.1 provenance pass-through", () => {
  it("originalUrl을 그대로 전달한다 (재구성/추측 금지)", () => {
    const input = makeQuestion();
    const result = normalizeQuestion(input);
    expect(result.sourceRef.originalUrl).toBe(
      input.sourceRef.originalUrl,
    );
  });

  it("fetchedAt을 그대로 전달한다 (재생성 금지)", () => {
    const input = makeQuestion();
    const result = normalizeQuestion(input);
    expect(result.sourceRef.fetchedAt).toBe(input.sourceRef.fetchedAt);
  });

  it("rawSourceFile/rawBlockId/contentHash를 그대로 전달한다", () => {
    const input = makeQuestion({
      sourceRef: {
        sourceName: "LAW",
        sourceQuestionId: "LAW-001",
        originalUrl: "https://example.test/questions/LAW-001.html",
        fetchedAt: "2026-08-13T00:00:00.000Z",
        rawSourceFile: "LAW/LAW-001.html",
        rawBlockId: "block-1",
        contentHash: "def456",
      },
    });
    const result = normalizeQuestion(input);
    expect(result.sourceRef.rawSourceFile).toBe("LAW/LAW-001.html");
    expect(result.sourceRef.rawBlockId).toBe("block-1");
    expect(result.sourceRef.contentHash).toBe("def456");
  });

  it("originalUrl/fetchedAt이 없으면 null로 유지한다", () => {
    const input = makeQuestion({
      sourceRef: {
        sourceName: "LAW",
        sourceQuestionId: "LAW-001",
        originalUrl: null,
        fetchedAt: null,
        rawSourceFile: "LAW/LAW-001.html",
        rawBlockId: "",
        contentHash: "",
      },
    });
    const result = normalizeQuestion(input);
    expect(result.sourceRef.originalUrl).toBeNull();
    expect(result.sourceRef.fetchedAt).toBeNull();
  });

  it("rawHtmlSnippetId는 STEP 6 책임이므로 이 단계에서는 null이다", () => {
    const input = makeQuestion();
    const result = normalizeQuestion(input);
    expect(result.sourceRef.rawHtmlSnippetId).toBeNull();
  });
});

describe("normalizeQuestion — explanation reference", () => {
  it("해설에 '12번 문제 참조' → metadata 생성 + REVIEW_REQUIRED", () => {
    const result = normalizeQuestion(
      makeQuestion({ explanation: "12번 문제 참조" }),
    );
    expect(result.explanationReference).toEqual({
      rawReferenceText: "12번 문제 참조",
      referencedQuestionNumber: 12,
    });
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
    expect(result.validationErrors).toContain("explanation_reference");
  });

  it("'앞 문제 참조' → 번호 없이 metadata 생성", () => {
    const result = normalizeQuestion(
      makeQuestion({ explanation: "앞 문제 참조" }),
    );
    expect(result.explanationReference?.referencedQuestionNumber).toBeNull();
  });

  it("일반 해설 → reference 없음", () => {
    const result = normalizeQuestion(makeQuestion());
    expect(result.explanationReference).toBeNull();
  });
});

const NEUTRAL_CHOICES = [
  { index: 1, text: "갑" },
  { index: 2, text: "을" },
  { index: 3, text: "병" },
  { index: 4, text: "정" },
];

describe("normalizeQuestion — category fallback", () => {
  it("EXTRA 소스 + rule 분류 실패 → UNKNOWN + REVIEW_REQUIRED", () => {
    const result = normalizeQuestion(
      makeQuestion({
        sourceName: "EXTRA",
        sourceQuestionId: "EXTRA-649",
        questionText: "완전히 새로운 주제의 문제",
        choices: NEUTRAL_CHOICES,
      }),
    );
    expect(result.category).toBe("UNKNOWN");
    expect(result.classificationMethod).toBe("unknown");
    expect(result.validationStatus).toBe("REVIEW_REQUIRED");
    expect(result.validationErrors).toContain("category_unclassified");
  });

  it("llmCategory fallback → 카테고리 적용 + metadata", () => {
    const result = normalizeQuestion(
      makeQuestion({
        sourceName: "EXTRA",
        sourceQuestionId: "EXTRA-649",
        questionText: "완전히 새로운 주제의 문제",
        choices: NEUTRAL_CHOICES,
      }),
      { llmCategory: { category: "CAT-SAFETY", confidence: 0.7 } },
    );
    expect(result.category).toBe("CAT-SAFETY");
    expect(result.classificationMethod).toBe("llm");
    expect(result.llmMetadata).toEqual({
      usedFor: ["classification"],
      confidenceScore: 0.7,
    });
  });

  it("llmAnswer fallback → 정답 정규화 + metadata", () => {
    const result = normalizeQuestion(
      makeQuestion({ rawAnswerText: "③ 또는 ④" }),
      { llmAnswer: { answers: [4], confidence: 0.6 } },
    );
    expect(result.normalizedAnswers).toEqual([4]);
    expect(result.llmMetadata).toEqual({
      usedFor: ["normalization"],
      confidenceScore: 0.6,
    });
    expect(result.validationStatus).toBe("VALID");
  });
});