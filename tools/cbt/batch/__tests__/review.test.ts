import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBatchReview } from "../review";
import { readRunLog } from "../runlog";
import { createFakeBatchContentDb } from "./fakeContentStore";

let runLogDir: string;
beforeAll(async () => {
  runLogDir = await mkdtemp(path.join(os.tmpdir(), "cbt-review-runlog-"));
});
afterAll(async () => {
  await rm(runLogDir, { recursive: true, force: true });
});

describe("runBatchReview", () => {
  it("QA_PASSED 2건 approve → APPROVED + reviewer 기록", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });
    fake.helpers.seedGenerated({ id: "g2", status: "QA_PASSED" });

    const summary = await runBatchReview(
      { action: "approve", ids: ["g1", "g2"], limit: 10, reviewer: "taekg" },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.results.every((r) => r.outcome === "approved")).toBe(true);
    const g1 = fake.store.generatedQuestions.find((r) => r.id === "g1");
    expect(g1.status).toBe("APPROVED");
    expect(g1.reviewedBy).toBe("taekg");
    expect(g1.reviewedAt).toBeInstanceOf(Date);
  });

  it("QA_PASSED reject → REJECTED", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });

    const summary = await runBatchReview(
      { action: "reject", ids: ["g1"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.results[0].outcome).toBe("rejected");
    const g1 = fake.store.generatedQuestions.find((r) => r.id === "g1");
    expect(g1.status).toBe("REJECTED");
  });

  it("잘못된 상태(GENERATED) approve → 기존 상태 머신이 거부, 해당 건 failed", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });
    fake.helpers.seedGenerated({ id: "g2", status: "GENERATED" });

    const summary = await runBatchReview(
      { action: "approve", ids: ["g1", "g2"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    const failed = summary.results.find((r) => r.generatedQuestionId === "g2");
    expect(failed?.outcome).toBe("failed");
    expect(failed?.error).toContain("approve 불가");
    // g1은 정상 승인 유지 (failure isolation)
    const g1 = fake.store.generatedQuestions.find((r) => r.id === "g1");
    expect(g1.status).toBe("APPROVED");
    // g2는 상태 유지
    const g2 = fake.store.generatedQuestions.find((r) => r.id === "g2");
    expect(g2.status).toBe("GENERATED");
  });

  it("이미 결정된 항목은 skipped (alreadyResolved)", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "APPROVED" });
    fake.helpers.seedGenerated({ id: "g2", status: "QA_PASSED" });

    const summary = await runBatchReview(
      { action: "approve", ids: ["g1", "g2"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.skipped).toBe(1);
    const skipped = summary.results.find((r) => r.generatedQuestionId === "g1");
    expect(skipped?.outcome).toBe("skipped");
    expect(skipped?.status).toBe("APPROVED");

    // run log 검증: alreadyResolved skip은 run_log에서 실패로 기록되지 않는다
    const log = await readRunLog(runLogDir, summary.runId!);
    expect(log.failedItemIds).not.toContain("g1");
    expect(log.runEnd?.succeeded).toBe(summary.total);
    expect(log.runEnd?.failed).toBe(0);
  });

  it("--all 모드는 QA_PASSED 전체를 대상으로 한다", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });
    fake.helpers.seedGenerated({ id: "g2", status: "QA_PASSED" });
    fake.helpers.seedGenerated({ id: "g3", status: "QA_FAILED" });

    const summary = await runBatchReview(
      { action: "approve", ids: [], all: true, limit: null, confirmAll: true },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.total).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(fake.store.generatedQuestions.find((r) => r.id === "g3").status).toBe(
      "QA_FAILED",
    );
  });

  it("--all + confirm flag 없음 → throw (safety guard)", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });

    await expect(
      runBatchReview(
        { action: "approve", ids: [], all: true, limit: null },
        { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
      ),
    ).rejects.toThrow("confirm flag");
  });

  it("dry-run → DB write 0, 결과 목록 비어있음", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });

    const summary = await runBatchReview(
      { action: "approve", ids: ["g1"], limit: 10, dryRun: true },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    expect(summary.results).toHaveLength(0);
    expect(summary.succeeded).toBe(0);
    const g1 = fake.store.generatedQuestions.find((r) => r.id === "g1");
    expect(g1.status).toBe("QA_PASSED");
    expect(g1.reviewedAt).toBeNull();
  });

  it("reviewer 미지정 시 기본값 batch-cli", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED" });

    await runBatchReview(
      { action: "approve", ids: ["g1"], limit: 10 },
      { contentDb: fake.contentDb, batchDb: fake.batchContentDb, runLogDir },
    );

    const g1 = fake.store.generatedQuestions.find((r) => r.id === "g1");
    expect(g1.reviewedBy).toBe("batch-cli");
  });
});
