import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RateLimitError extends Error {
    retryAfterSeconds: number;
    constructor(retryAfterSeconds: number) {
      super("SECURITY_RATE_LIMITED");
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
  return {
    headers: vi.fn(), currentUser: vi.fn(), grade: vi.fn(), record: vi.fn(),
    submit: vi.fn(), toggle: vi.fn(), enforce: vi.fn(), distinct: vi.fn(),
    RateLimitError,
  };
});

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/cbt/service", () => ({
  gradeCbtAnswer: mocks.grade,
  recordPracticeResult: mocks.record,
  submitExam: mocks.submit,
  toggleBookmark: mocks.toggle,
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRequestRateLimit: mocks.enforce,
  enforceDistinctRequestLimit: mocks.distinct,
  SecurityRateLimitError: mocks.RateLimitError,
  SECURITY_RATE_LIMITS: {
    cbtAnswer: { limit: 60, windowMs: 600_000 },
    cbtDistinctQuestions: { limit: 45, windowMs: 600_000 },
    cbtExamSubmit: { limit: 8, windowMs: 3_600_000 },
  },
}));

import { gradeCbtAnswerAction, submitCbtExamAction } from "@/lib/cbt/actions";
import { SecurityRateLimitError } from "@/lib/security/rate-limit";

describe("Security P0 anonymous CBT protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mocks.currentUser.mockResolvedValue(null);
    mocks.enforce.mockResolvedValue(undefined);
    mocks.distinct.mockResolvedValue(undefined);
    mocks.grade.mockResolvedValue({ isCorrect: true, correctOption: 2, explanation: "해설" });
    mocks.submit.mockResolvedValue({ totalQuestions: 1, correctCount: 1, score: 100, passed: true, results: [] });
  });

  it("keeps normal anonymous learning and answer/explanation feedback available", async () => {
    await expect(gradeCbtAnswerAction("question-1", 2)).resolves.toEqual({
      ok: true,
      data: { isCorrect: true, correctOption: 2, explanation: "해설" },
    });
    expect(mocks.enforce).toHaveBeenCalled();
    expect(mocks.distinct).toHaveBeenCalledWith(expect.objectContaining({
      distinctValue: "question-1",
    }));
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("returns a controlled response for automated/bulk answer pressure", async () => {
    mocks.distinct.mockRejectedValueOnce(new SecurityRateLimitError(60));
    await expect(gradeCbtAnswerAction("question-46", 1)).resolves.toEqual({
      ok: false,
      message: "풀이 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(mocks.grade).not.toHaveBeenCalled();
  });

  it("keeps a normal anonymous exam submission available", async () => {
    await expect(submitCbtExamAction("freight", { "question-1": 2 }, 120))
      .resolves.toMatchObject({ ok: true, data: { score: 100 } });
    expect(mocks.submit).toHaveBeenCalledWith("freight", { "question-1": 2 }, 120, null);
  });
});
