import { describe, expect, it } from "vitest";
import { promoteToMaster } from "../promotion";
import { createFakeContentDb } from "./fakeContentDb";
import type { GeneratedQuestionStatus } from "../types";

async function seedApproved(
  fake: ReturnType<typeof createFakeContentDb>,
  status: GeneratedQuestionStatus = "APPROVED",
) {
  fake.helpers.seedCandidate({ id: "c1" });
  return fake.db.generatedQuestion.create({
    data: {
      candidateQuestionId: "cq_c1",
      status,
      questionText: "화물 적재 시 올바른 방법은 무엇인가?",
      choices: [
        { index: 1, text: "한쪽에 몰아 싣는다" },
        { index: 2, text: "중심에 고르게 싣는다" },
        { index: 3, text: "뒤로만 싣는다" },
        { index: 4, text: "돌출시켜 싣는다" },
      ],
      answers: [2],
      explanation: "무게 중심을 낮추면 안전하다.",
      category: "CAT-HANDLING",
      difficulty: "MEDIUM",
    },
  } as never);
}

describe("Master Promotion (STEP 8 §19)", () => {
  it("APPROVED → MasterQuestion 생성 (필드 복제)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedApproved(fake);

    const outcome = await promoteToMaster(fake.db, gq.id);

    expect(outcome.created).toBe(true);
    const master = fake.store.masterQuestions.find(
      (r) => r.id === outcome.masterQuestionId,
    );
    expect(master.generatedQuestionId).toBe(gq.id);
    expect(master.questionText).toBe(gq.questionText);
    expect(master.category).toBe("CAT-HANDLING");
    expect(master.difficulty).toBe("MEDIUM");
    expect(master.answers).toEqual([2]);
    expect(master.isActive).toBe(true);
    expect(master.publishedAt).toBeInstanceOf(Date);
  });

  it("H. duplicate promotion → idempotent (Master 중복 생성 금지)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedApproved(fake);

    const first = await promoteToMaster(fake.db, gq.id);
    const second = await promoteToMaster(fake.db, gq.id);

    expect(first.masterQuestionId).toBe(second.masterQuestionId);
    expect(second.created).toBe(false);
    expect(fake.store.masterQuestions).toHaveLength(1);
  });

  it("APPROVED가 아니면 promote 불가 (자동 승격 금지)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedApproved(fake, "QA_PASSED");
    await expect(promoteToMaster(fake.db, gq.id)).rejects.toThrow(
      "APPROVED만 승격 가능",
    );
  });

  it("FAILED는 promote 불가", async () => {
    const fake = createFakeContentDb();
    const gq = await seedApproved(fake, "FAILED");
    await expect(promoteToMaster(fake.db, gq.id)).rejects.toThrow();
  });

  it("Master에는 원자료 HTML/raw LLM response가 없다 (운영 데이터 분리)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedApproved(fake);
    // generated에 raw 데이터 주입
    fake.store.generatedQuestions[0].rawLlmResponse = { huge: "raw" };
    fake.store.candidates[0].rawHtmlSnippetId = "snippet-abc";

    const outcome = await promoteToMaster(fake.db, gq.id);
    const master = fake.store.masterQuestions.find(
      (r) => r.id === outcome.masterQuestionId,
    );
    expect("rawLlmResponse" in master).toBe(false);
    expect("rawHtmlSnippetId" in master).toBe(false);
  });

  it("transaction: Master 생성 실패 시 롤백 (부분 생성 없음)", async () => {
    const fake = createFakeContentDb();
    const gq = await seedApproved(fake);

    const originalCreate = fake.db.masterQuestion.create;
    (fake.db as unknown as { masterQuestion: { create: unknown } }).masterQuestion.create =
      async () => {
        throw new Error("master create failed");
      };

    await expect(promoteToMaster(fake.db, gq.id)).rejects.toThrow(
      "master create failed",
    );
    expect(fake.store.masterQuestions).toHaveLength(0);

    (fake.db as unknown as { masterQuestion: { create: unknown } }).masterQuestion.create =
      originalCreate;
  });

  it("존재하지 않는 generatedQuestionId → throw", async () => {
    const fake = createFakeContentDb();
    await expect(promoteToMaster(fake.db, "gq_missing")).rejects.toThrow(
      "not found",
    );
  });
});
