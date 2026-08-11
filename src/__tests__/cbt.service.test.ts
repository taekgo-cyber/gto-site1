import { beforeEach, describe, expect, it, vi } from "vitest";
import * as cbtDal from "@/lib/cbt/dal";

vi.mock("@/lib/cbt/dal", () => ({
  getQuestionAnswerForGrading: vi.fn(),
}));

import { gradeCbtAnswer } from "@/lib/cbt/service";
import type { CbtQuestionForGrading } from "@/lib/cbt/dal";

function makeQuestion(overrides: Partial<CbtQuestionForGrading> = {}): CbtQuestionForGrading {
  return {
    id: "q-1",
    status: "PUBLISHED",
    options: [
      { id: 1, text: "보기 1" },
      { id: 2, text: "보기 2" },
      { id: 3, text: "보기 3" },
      { id: 4, text: "보기 4" },
    ],
    correctOption: 2,
    explanation: "정답 해설",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gradeCbtAnswer", () => {
  it("정답을 선택하면 isCorrect가 true이고 correctOption/explanation을 반환한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(makeQuestion());

    const result = await gradeCbtAnswer("q-1", 2);

    expect(result).toEqual({
      isCorrect: true,
      correctOption: 2,
      explanation: "정답 해설",
    });
  });

  it("오답을 선택하면 isCorrect가 false이면서 correctOption은 유지한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(makeQuestion());

    const result = await gradeCbtAnswer("q-1", 1);

    expect(result.isCorrect).toBe(false);
    expect(result.correctOption).toBe(2);
  });

  it("explanation이 null이면 null을 반환한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(
      makeQuestion({ explanation: null }),
    );

    const result = await gradeCbtAnswer("q-1", 2);

    expect(result.explanation).toBeNull();
  });

  it("존재하지 않는 문제는 404 오류를 던진다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(null);

    await expect(gradeCbtAnswer("missing", 2)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("DRAFT 문제는 404 오류를 던진다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(
      makeQuestion({ status: "DRAFT" }),
    );

    await expect(gradeCbtAnswer("q-1", 2)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("HIDDEN 문제는 404 오류를 던진다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(
      makeQuestion({ status: "HIDDEN" }),
    );

    await expect(gradeCbtAnswer("q-1", 2)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("문제에 존재하지 않는 optionId는 400 오류를 던진다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(makeQuestion());

    await expect(gradeCbtAnswer("q-1", 99)).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
    });
  });

  it("questionId가 빈 문자열이면 400 오류를 던진다", async () => {
    await expect(gradeCbtAnswer("", 2)).rejects.toMatchObject({
      status: 400,
    });
    expect(cbtDal.getQuestionAnswerForGrading).not.toHaveBeenCalled();
  });

  it("selectedOptionId가 정수가 아니면 400 오류를 던진다", async () => {
    await expect(gradeCbtAnswer("q-1", 1.5)).rejects.toMatchObject({
      status: 400,
    });
    await expect(gradeCbtAnswer("q-1", "2" as unknown as number)).rejects.toMatchObject({
      status: 400,
    });
    expect(cbtDal.getQuestionAnswerForGrading).not.toHaveBeenCalled();
  });
});
