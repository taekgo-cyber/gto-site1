import { describe, expect, it } from "vitest";
import { reviewGeneratedQuestion } from "../review";
import { createFakeContentDb } from "./fakeContentDb";
import type { GeneratedQuestionStatus } from "../types";

function seedGeneratedQuestion(
  fake: ReturnType<typeof createFakeContentDb>,
  status: GeneratedQuestionStatus,
) {
  fake.helpers.seedCandidate({ id: "c1" });
  return fake.db.generatedQuestion.create({
    data: {
      candidateQuestionId: "cq_c1",
      status,
      questionText: "질문",
      choices: { test: true },
      answers: [1],
      explanation: "해설",
      category: "CAT-HANDLING",
      difficulty: "MEDIUM",
    },
  } as never);
}

describe("Human Review (STEP 8 §18)", () => {
  it("QA_PASSED → approve → APPROVED + reviewer/reviewedAt 기록", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "QA_PASSED");

    const outcome = await reviewGeneratedQuestion(fake.db, gq.id, "approve", "human-1");

    expect(outcome.status).toBe("APPROVED");
    expect(outcome.alreadyResolved).toBe(false);
    const row = fake.store.generatedQuestions.find((r) => r.id === gq.id);
    expect(row.status).toBe("APPROVED");
    expect(row.reviewedBy).toBe("human-1");
    expect(row.reviewedAt).toBeInstanceOf(Date);
  });

  it("approve는 QA_PASSED/HUMAN_REVIEW만 허용 (GENERATED는 거부)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "GENERATED");
    await expect(
      reviewGeneratedQuestion(fake.db, gq.id, "approve"),
    ).rejects.toThrow("approve 불가");
  });

  it("approve는 QA_PASSED/HUMAN_REVIEW만 허용 (QA_PENDING은 거부)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "QA_PENDING");
    await expect(
      reviewGeneratedQuestion(fake.db, gq.id, "approve"),
    ).rejects.toThrow("approve 불가");
  });

  it("approve는 QA_PASSED/HUMAN_REVIEW만 허용 (QA_FAILED는 거부)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "QA_FAILED");
    await expect(
      reviewGeneratedQuestion(fake.db, gq.id, "approve"),
    ).rejects.toThrow("approve 불가");
  });

  it("REJECTED는 재승인 불가 (REJECTED → approve 거부)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "REJECTED");
    await expect(
      reviewGeneratedQuestion(fake.db, gq.id, "approve"),
    ).rejects.toThrow("approve 불가");
  });

  it("QA_FAILED → reject → REJECTED", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "QA_FAILED");
    const outcome = await reviewGeneratedQuestion(fake.db, gq.id, "reject");
    expect(outcome.status).toBe("REJECTED");
  });

  it("reject는 GENERATED는 허용하지 않는다", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "GENERATED");
    await expect(
      reviewGeneratedQuestion(fake.db, gq.id, "reject"),
    ).rejects.toThrow("reject 불가");
  });

  it("이미 APPROVED면 approve는 idempotent (alreadyResolved)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedGeneratedQuestion(fake, "APPROVED");
    const outcome = await reviewGeneratedQuestion(fake.db, gq.id, "approve");
    expect(outcome.status).toBe("APPROVED");
    expect(outcome.alreadyResolved).toBe(true);
  });

  it("존재하지 않는 id → throw", async () => {
    const fake = createFakeContentDb();
    await expect(
      reviewGeneratedQuestion(fake.db, "gq_missing", "approve"),
    ).rejects.toThrow("not found");
  });
});
