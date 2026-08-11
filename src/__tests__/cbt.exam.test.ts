import { describe, expect, it } from "vitest";
import { buildExamSet, gradeExamAnswers, type GradingQuestion } from "@/lib/cbt/exam";
import { CBT_EXAM_CONFIG } from "@/lib/cbt/constants";
import type { PublicCbtQuestion, CbtOption } from "@/lib/cbt/types";

function makePublicQuestion(
  id: string,
  subject: string,
  options: CbtOption[] = [
    { id: 1, text: "보기 1" },
    { id: 2, text: "보기 2" },
    { id: 3, text: "보기 3" },
    { id: 4, text: "보기 4" },
  ],
): PublicCbtQuestion {
  return { id, subject, questionText: `문제 ${id}`, options, imageUrl: null };
}

function makeGradingQuestion(
  id: string,
  subject: string,
  correctOption = 2,
): GradingQuestion {
  return {
    id,
    categoryId: "c-1",
    subject,
    status: "PUBLISHED",
    options: [
      { id: 1, text: "보기 1" },
      { id: 2, text: "보기 2" },
      { id: 3, text: "보기 3" },
      { id: 4, text: "보기 4" },
    ],
    correctOption,
    explanation: "해설",
  };
}

describe("buildExamSet", () => {
  it("과목별 quota만큼 추출하고 문제 순서를 랜덤화한다", () => {
    const questions = Array.from({ length: 30 }, (_, i) =>
      makePublicQuestion(`q-${i}`, i % 2 === 0 ? "교통법규" : "안전운행"),
    );

    const set = buildExamSet(questions, {
      ...CBT_EXAM_CONFIG,
      questionsPerSubject: 10,
    });

    const subjects = new Map<string, number>();
    for (const question of set) {
      subjects.set(question.subject, (subjects.get(question.subject) ?? 0) + 1);
    }
    expect(subjects.get("교통법규")).toBe(10);
    expect(subjects.get("안전운행")).toBe(10);
    expect(set).toHaveLength(20);
    expect(new Set(set.map((q) => q.id)).size).toBe(20);
  });

  it("과목 가용 문항이 quota보다 적으면 있는 만큼만 사용한다", () => {
    const questions = [
      makePublicQuestion("q-1", "교통법규"),
      makePublicQuestion("q-2", "교통법규"),
      makePublicQuestion("q-3", "안전운행"),
    ];

    const set = buildExamSet(questions, {
      ...CBT_EXAM_CONFIG,
      questionsPerSubject: 20,
    });

    expect(set).toHaveLength(3);
    expect(new Set(set.map((q) => q.id)).size).toBe(3);
  });

  it("빈 문제 목록은 빈 세트를 반환한다", () => {
    expect(buildExamSet([])).toEqual([]);
  });
});

describe("gradeExamAnswers", () => {
  const questions = [
    makeGradingQuestion("q-1", "교통법규", 2),
    makeGradingQuestion("q-2", "교통법규", 1),
    makeGradingQuestion("q-3", "안전운행", 3),
    makeGradingQuestion("q-4", "안전운행", 4),
  ];

  it("전부 정답이면 100점으로 합격 처리한다", () => {
    const result = gradeExamAnswers(questions, {
      "q-1": 2,
      "q-2": 1,
      "q-3": 3,
      "q-4": 4,
    });

    expect(result.score).toBe(100);
    expect(result.correctCount).toBe(4);
    expect(result.wrongCount).toBe(0);
    expect(result.unansweredCount).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("미응답은 오답(0점)으로 처리한다", () => {
    const result = gradeExamAnswers(questions, { "q-1": 2 });

    expect(result.correctCount).toBe(1);
    expect(result.unansweredCount).toBe(3);
    expect(result.wrongCount).toBe(3);
    expect(result.score).toBe(25);
    expect(result.results.find((r) => r.questionId === "q-2")).toMatchObject({
      selectedOptionId: null,
      isCorrect: false,
    });
  });

  it("과목별 결과를 포함한다", () => {
    const result = gradeExamAnswers(questions, {
      "q-1": 2,
      "q-2": 1,
      "q-3": 3,
      "q-4": 4,
    });

    const traffic = result.subjectResults.find((s) => s.subject === "교통법규");
    expect(traffic).toMatchObject({ total: 2, correct: 2, score: 100 });
  });

  it("총점이 합격선 미만이면 불합격 처리한다", () => {
    const result = gradeExamAnswers(questions, { "q-1": 2 });

    expect(result.passed).toBe(false);
  });

  it("과목 점수가 과락선 미만이면 총점이 높아도 불합격 처리한다", () => {
    const result = gradeExamAnswers(questions, {
      "q-1": 2,
      "q-2": 1,
      "q-3": 3,
      "q-4": 1, // 안전운행 1/2 = 50점은 통과... 교통법규 2/2 = 100점
    });

    // 위 구성은 모두 과목 과락을 넘기므로 통과가 정상. 과락 케이스를 다시 구성한다.
    expect(result.passed).toBe(true);

    const failResult = gradeExamAnswers(questions, {
      "q-1": 2,
      "q-2": 1,
      "q-3": 4, // 안전운행 0/2 = 0점 과락
      "q-4": 3,
    });
    expect(failResult.score).toBe(50);
    expect(failResult.passed).toBe(false);
  });

  it("explanation과 correctOption을 결과에 포함한다", () => {
    const result = gradeExamAnswers(questions, { "q-1": 1 });

    expect(result.results[0]).toMatchObject({
      questionId: "q-1",
      correctOption: 2,
      explanation: "해설",
      isCorrect: false,
    });
  });

  it("빈 문제 목록은 0점 불합격을 반환한다", () => {
    const result = gradeExamAnswers([], {});
    expect(result).toMatchObject({
      totalQuestions: 0,
      score: 0,
      passed: false,
    });
  });
});
