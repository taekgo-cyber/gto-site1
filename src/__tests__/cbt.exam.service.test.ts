import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cbt/dal", () => ({
  getCbtCategoryBySlug: vi.fn(),
  getQuestionsForGradingByIds: vi.fn(),
  createExamRecord: vi.fn(),
  recordPracticeResult: vi.fn(),
  getQuestionActivity: vi.fn(),
  getQuestionAnswerForGrading: vi.fn(),
  upsertBookmark: vi.fn(),
  upsertQuestionActivity: vi.fn(),
}));

import * as cbtDal from "@/lib/cbt/dal";
import { submitExam } from "@/lib/cbt/service";
import type { CbtQuestionForBatchGrading } from "@/lib/cbt/dal";

const CATEGORY = {
  id: "c-1",
  slug: "cargo-driver",
  name: "화물운송종사자격시험",
  description: null,
  questionCount: 4,
};

function makeQuestion(
  id: string,
  categoryId = "c-1",
  status = "PUBLISHED",
  correctOption = 2,
): CbtQuestionForBatchGrading {
  return {
    id,
    categoryId,
    subject: "교통법규",
    status: status as CbtQuestionForBatchGrading["status"],
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

function makeAnswers(ids: string[], optionId = 2): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const id of ids) answers[id] = optionId;
  return answers;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cbtDal.getCbtCategoryBySlug).mockResolvedValue(CATEGORY);
});

describe("submitExam", () => {
  it("정상 제출 시 서버 채점 결과를 반환한다", async () => {
    const questions = [makeQuestion("q-1"), makeQuestion("q-2", "c-1")];
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue(questions);

    const result = await submitExam(
      "cargo-driver",
      makeAnswers(["q-1", "q-2"]),
      null,
      null,
    );

    expect(result).toMatchObject({ totalQuestions: 2, correctCount: 2, score: 100 });
    expect(result.results[0]).toMatchObject({ questionId: "q-1", isCorrect: true });
  });

  it("로그인 사용자는 시험 기록과 문제 활동을 저장한다", async () => {
    const questions = [makeQuestion("q-1"), makeQuestion("q-2")];
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue(questions);

    await submitExam("cargo-driver", makeAnswers(["q-1", "q-2"]), 300, "user-1");

    expect(cbtDal.createExamRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        categoryId: "c-1",
        score: 100,
        passed: true,
        durationSeconds: 300,
      }),
    );
    expect(cbtDal.upsertQuestionActivity).toHaveBeenCalledTimes(2);
  });

  it("비로그인은 저장 없이 채점 결과만 반환한다", async () => {
    const questions = [makeQuestion("q-1")];
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue(questions);

    await submitExam("cargo-driver", makeAnswers(["q-1"]), null, null);

    expect(cbtDal.createExamRecord).not.toHaveBeenCalled();
    expect(cbtDal.upsertQuestionActivity).not.toHaveBeenCalled();
  });

  it("다른 카테고리의 questionId는 400으로 차단한다", async () => {
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue([
      makeQuestion("q-1", "c-other"),
    ]);

    await expect(
      submitExam("cargo-driver", makeAnswers(["q-1"]), null, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("존재하지 않는 questionId는 400으로 차단한다", async () => {
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue([]);

    await expect(
      submitExam("cargo-driver", makeAnswers(["missing"]), null, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("PUBLISHED가 아닌 문제는 400으로 차단한다", async () => {
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue([
      makeQuestion("q-1", "c-1", "DRAFT"),
    ]);

    await expect(
      submitExam("cargo-driver", makeAnswers(["q-1"]), null, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("존재하지 않는 optionId는 400으로 차단한다", async () => {
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue([
      makeQuestion("q-1"),
    ]);

    await expect(
      submitExam("cargo-driver", makeAnswers(["q-1"], 99), null, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("답안 개수 상한을 초과하면 400으로 차단한다", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `q-${i}`);

    await expect(
      submitExam("cargo-driver", makeAnswers(ids), null, null),
    ).rejects.toMatchObject({ status: 400 });
    expect(cbtDal.getQuestionsForGradingByIds).not.toHaveBeenCalled();
  });

  it("잘못된 answers 형태는 400으로 차단한다", async () => {
    await expect(
      submitExam("cargo-driver", [] as unknown as Record<string, number>, null, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("빈 답안은 400으로 차단한다", async () => {
    await expect(
      submitExam("cargo-driver", {}, null, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("존재하지 않는 카테고리는 404를 반환한다", async () => {
    vi.mocked(cbtDal.getCbtCategoryBySlug).mockResolvedValue(null);

    await expect(
      submitExam("unknown", makeAnswers(["q-1"]), null, null),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("questionId 조회는 in 조건 한 번으로 수행한다", async () => {
    vi.mocked(cbtDal.getQuestionsForGradingByIds).mockResolvedValue([
      makeQuestion("q-1"),
      makeQuestion("q-2"),
    ]);

    await submitExam("cargo-driver", makeAnswers(["q-1", "q-2"]), null, null);

    expect(cbtDal.getQuestionsForGradingByIds).toHaveBeenCalledTimes(1);
    expect(cbtDal.getQuestionsForGradingByIds).toHaveBeenCalledWith(
      expect.arrayContaining(["q-1", "q-2"]),
    );
  });
});
