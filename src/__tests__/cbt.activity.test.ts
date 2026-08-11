import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cbt/dal", () => ({
  getQuestionAnswerForGrading: vi.fn(),
  getQuestionActivity: vi.fn(),
  upsertBookmark: vi.fn(),
  upsertQuestionActivity: vi.fn(),
  getCbtCategoryBySlug: vi.fn(),
  getQuestionsForGradingByIds: vi.fn(),
  createExamRecord: vi.fn(),
  recordPracticeResult: vi.fn(),
}));

import * as cbtDal from "@/lib/cbt/dal";
import { recordPracticeResult, toggleBookmark } from "@/lib/cbt/service";
import type { CbtQuestionForGrading } from "@/lib/cbt/dal";

const PUBLISHED_QUESTION: CbtQuestionForGrading = {
  id: "q-1",
  status: "PUBLISHED",
  options: [
    { id: 1, text: "보기 1" },
    { id: 2, text: "보기 2" },
    { id: 3, text: "보기 3" },
    { id: 4, text: "보기 4" },
  ],
  correctOption: 2,
  explanation: "해설",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordPracticeResult", () => {
  it("업서트 기반으로 문제 활동을 기록한다", async () => {
    await recordPracticeResult("user-1", "q-1", 2, true);

    expect(cbtDal.upsertQuestionActivity).toHaveBeenCalledWith({
      userId: "user-1",
      questionId: "q-1",
      selectedOptionId: 2,
      isCorrect: true,
    });
  });
});

describe("toggleBookmark", () => {
  it("북마크를 켜고 true를 반환한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(
      PUBLISHED_QUESTION,
    );
    vi.mocked(cbtDal.getQuestionActivity).mockResolvedValue({ bookmarked: false });

    const result = await toggleBookmark("user-1", "q-1");

    expect(result).toBe(true);
    expect(cbtDal.upsertBookmark).toHaveBeenCalledWith("user-1", "q-1", true);
  });

  it("북마크를 해제하고 false를 반환한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(
      PUBLISHED_QUESTION,
    );
    vi.mocked(cbtDal.getQuestionActivity).mockResolvedValue({ bookmarked: true });

    const result = await toggleBookmark("user-1", "q-1");

    expect(result).toBe(false);
    expect(cbtDal.upsertBookmark).toHaveBeenCalledWith("user-1", "q-1", false);
  });

  it("PUBLISHED가 아닌 문제는 404를 반환한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue({
      ...PUBLISHED_QUESTION,
      status: "DRAFT",
    });

    await expect(toggleBookmark("user-1", "q-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(cbtDal.upsertBookmark).not.toHaveBeenCalled();
  });

  it("존재하지 않는 문제는 404를 반환한다", async () => {
    vi.mocked(cbtDal.getQuestionAnswerForGrading).mockResolvedValue(null);

    await expect(toggleBookmark("user-1", "q-1")).rejects.toMatchObject({
      status: 404,
    });
  });
});
