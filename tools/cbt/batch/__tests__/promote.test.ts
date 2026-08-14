/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { runBatchPromote, MAX_PROMOTE_CONCURRENCY, DEFAULT_PROMOTE_CONCURRENCY } from "../promote";
import { createFakeBatchContentDb } from "./fakeContentStore";

describe("runBatchPromote", () => {
  it("APPROVED 2건 → Master 2건 생성", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g2", status: "APPROVED" });

    const summary = await runBatchPromote(
      { ids: ["g1", "g2"], limit: 10, concurrency: 2 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.results.every((r) => r.outcome === "promoted")).toBe(true);
    expect(fake.store.masterQuestions).toHaveLength(2);
    for (const r of summary.results) {
      expect(r.masterQuestionId).toBeTruthy();
    }
  });

  it("--all 모드는 APPROVED 전체를 대상으로 한다", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g2", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g3", status: "QA_PASSED" });

    const summary = await runBatchPromote(
      { ids: [], all: true, limit: null },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    expect(summary.total).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(fake.store.masterQuestions).toHaveLength(2);
  });

  it("기존 Master 보유 → skipped, 중복 생성 없음 (idempotency)", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g2", status: "APPROVED" });

    // g1은 이미 Master 존재
    fake.store.masterQuestions.push({
      id: "master_existing",
      generatedQuestionId: "g1",
      category: "CAT-HANDLING",
      questionText: "질문",
      choices: [{ index: 1, text: "A" }],
      answers: [1],
      difficulty: "MEDIUM",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await runBatchPromote(
      { ids: ["g1", "g2"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    expect(summary.skipped).toBe(1);
    expect(summary.succeeded).toBe(1);
    const g1Result = summary.results.find((r) => r.generatedQuestionId === "g1");
    expect(g1Result?.outcome).toBe("skipped");
    expect(g1Result?.masterQuestionId).toBe("master_existing");
    // 중복 생성 없음
    const g1Masters = fake.store.masterQuestions.filter(
      (r) => r.generatedQuestionId === "g1",
    );
    expect(g1Masters).toHaveLength(1);
  });

  it("APPROVED가 아닌 문항 → promoteToMaster가 거부, 해당 건 failed (isolation)", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g2", status: "QA_PASSED" });

    const summary = await runBatchPromote(
      { ids: ["g1", "g2"], limit: 10, concurrency: 2 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    const failed = summary.results.find((r) => r.generatedQuestionId === "g2");
    expect(failed?.outcome).toBe("failed");
    expect(failed?.error).toContain("APPROVED만 승격 가능");
    // g2는 Master로 승격되지 않음
    expect(
      fake.store.masterQuestions.some((r) => r.generatedQuestionId === "g2"),
    ).toBe(false);
    // g1은 승격 유지
    expect(
      fake.store.masterQuestions.some((r) => r.generatedQuestionId === "g1"),
    ).toBe(true);
  });

  it("P2002 unique violation → skipped (race 처리)", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });

    // promoteToMaster가 findMaster로 기존 행을 발견하지 못한 상태에서(동시 실행 race),
    // masterQuestion.create가 unique constraint(P2002)로 실패하는 상황을 모의한다.
    // → runBatchPromote가 P2002를 감지해 skipped로 처리하고 batch를 중단시키지 않는다.
    const originalCreate = fake.contentDb.masterQuestion.create;
    (fake.contentDb as any).masterQuestion.create = async () => {
      const err = new Error("Unique constraint failed on the fields") as Error & {
        code?: string;
      };
      err.code = "P2002";
      throw err;
    };

    const summary = await runBatchPromote(
      { ids: ["g1"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    const result = summary.results[0];
    expect(result.outcome).toBe("skipped");
    expect(result.error).toContain("P2002");
    // batch가 중단되지 않음
    expect(summary.total).toBe(1);

    (fake.contentDb as any).masterQuestion.create = originalCreate;
  });

  it("dry-run → Master 0건, 대상 목록만", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });

    const summary = await runBatchPromote(
      { ids: ["g1"], limit: 10, dryRun: true },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    expect(summary.results).toHaveLength(0);
    expect(summary.total).toBe(1);
    expect(fake.store.masterQuestions).toHaveLength(0);
  });

  it("concurrency=2 → 전체 결과 수/순서 정상", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g2", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g3", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g4", status: "APPROVED" });

    const summary = await runBatchPromote(
      { ids: ["g1", "g2", "g3", "g4"], limit: 10, concurrency: 2 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb },
    );

    expect(summary.results).toHaveLength(4);
    expect(summary.succeeded).toBe(4);
    expect(summary.results.map((r) => r.generatedQuestionId)).toEqual([
      "g1",
      "g2",
      "g3",
      "g4",
    ]);
    expect(fake.store.masterQuestions).toHaveLength(4);
  });

  it("상수 검증: 기본 concurrency 3, 최대 10", () => {
    expect(DEFAULT_PROMOTE_CONCURRENCY).toBe(3);
    expect(MAX_PROMOTE_CONCURRENCY).toBe(10);
  });
});