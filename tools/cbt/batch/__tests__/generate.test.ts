/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 9 — batch-generate orchestration 테스트.
// runBatchGenerate는 실제 로직(listGenerationTargets + runPool + runContentProduction)을
// fake batch DB / fake content DB / MockLlmProvider로 검증한다.
// LLM·DB write는 dry-run에서 0회, 실패는 batch를 중단시키지 않는다.
import { describe, expect, it } from "vitest";
import { MOCK_GENERATED_QUESTION, MOCK_QA_PASS } from "../../content/provider";
import { MockLlmProvider, type MockScript } from "../../content/provider/mock";
import { createFakeContentDb } from "../../content/__tests__/fakeContentDb";
import { runBatchGenerate } from "../generate";
import type { BatchCandidateDb } from "../candidate-query";
import type { CandidateQuestion } from "@/generated/prisma/client";

type Row = {
  id: string;
  validationStatus: string;
  createdAt: Date;
  [key: string]: unknown;
};

function makeCandidate(id: string, validationStatus: string, createdAt: number): Row {
  return { id, validationStatus, createdAt: new Date(createdAt) };
}

/** BatchCandidateDb 최소 fake — listGenerationTargets가 쓰는 where/select/orderBy만 처리 */
function createFakeBatchDb(candidates: Row[], generatedCandidateIds: string[]) {
  const db: BatchCandidateDb = {
    candidateQuestion: {
      async findMany(args: any) {
        const where = args?.where ?? {};
        let rows = [...candidates];
        if (where.validationStatus?.not) {
          rows = rows.filter((r) => r.validationStatus !== where.validationStatus.not);
        }
        if (where.id?.in) {
          const set = new Set(where.id.in);
          rows = rows.filter((r) => set.has(r.id));
        }
        if (args?.orderBy?.createdAt) {
          const dir = args.orderBy.createdAt === "desc" ? -1 : 1;
          rows.sort((a, b) => (a.createdAt < b.createdAt ? -dir : dir));
        }
        return rows as unknown as CandidateQuestion[];
      },
    },
    generatedQuestion: {
      async findMany(args: any) {
        if (args?.select?.candidateQuestionId) {
          return generatedCandidateIds.map((candidateQuestionId) => ({ candidateQuestionId }));
        }
        return [];
      },
    },
  };
  return db;
}

function happyScript(count: number): MockScript {
  const script: MockScript = [];
  for (let i = 0; i < count; i += 1) {
    script.push({ kind: "normal", data: MOCK_GENERATED_QUESTION });
    script.push({ kind: "normal", data: MOCK_QA_PASS });
  }
  return script;
}

describe("runBatchGenerate", () => {
  it("REJECTED candidate는 대상에서 제외된다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "REJECTED", 2),
      ],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.total).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(summary.results.map((r) => r.candidateId)).toEqual(["cq_c1"]);
    expect(content.store.generatedQuestions).toHaveLength(1);
  });

  it("기존 GeneratedQuestion을 보유한 candidate는 스킵된다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
      ],
      ["cq_c1"],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c2" });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.skipped).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.results.map((r) => r.candidateId)).toEqual(["cq_c2"]);
  });

  it("dry-run → provider 호출 0회, DB write 0회", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
      ],
      ["cq_c2"],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { limit: 10, dryRun: true },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.succeeded).toBe(0);
    expect(summary.results).toHaveLength(0);
    expect(provider.calls).toBe(0);
    expect(content.store.generatedQuestions).toHaveLength(0);
  });

  it("Mock generation 2건 → 전부 QA_PASSED, generatedQuestions 2건", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
      ],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    content.helpers.seedCandidate({ id: "c2" });
    const provider = new MockLlmProvider(happyScript(2));

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.total).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.results.every((r) => r.outcome === "generated")).toBe(true);
    expect(summary.results.every((r) => r.status === "QA_PASSED")).toBe(true);
    expect(content.store.generatedQuestions).toHaveLength(2);
  });

  it("한 candidate 실패 시 나머지는 계속 처리된다 (failure isolation)", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_missing", "VALID", 1),
        makeCandidate("cq_c1", "VALID", 2),
        makeCandidate("cq_c2", "VALID", 3),
      ],
      [],
    );
    const content = createFakeContentDb();
    // cq_missing은 contentDb에 없음 → findCandidateById null → 실패
    content.helpers.seedCandidate({ id: "c1" });
    content.helpers.seedCandidate({ id: "c2" });
    const provider = new MockLlmProvider(happyScript(2));

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.total).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(2);
    const failed = summary.results.find((r) => r.candidateId === "cq_missing");
    expect(failed?.outcome).toBe("failed");
    expect(failed?.error).toContain("candidate not found");
    expect(content.store.generatedQuestions).toHaveLength(2);
  });

  it("force=true → 기존 GeneratedQuestion 보존 + 새 행 append", async () => {
    const batchDb = createFakeBatchDb(
      [makeCandidate("cq_c1", "VALID", 1)],
      ["cq_c1"],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    // 기존 GeneratedQuestion 1건 선행 등록 (append-only인지 확인용)
    content.store.generatedQuestions.push({
      id: "gq_existing",
      candidateQuestionId: "cq_c1",
      status: "QA_PASSED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { limit: 10, force: true, concurrency: 1 },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.skipped).toBe(0);
    expect(summary.succeeded).toBe(1);
    expect(content.store.generatedQuestions).toHaveLength(2);
    const existing = content.store.generatedQuestions.find(
      (r) => r.id === "gq_existing",
    );
    expect(existing?.status).toBe("QA_PASSED");
    const newRow = content.store.generatedQuestions.find(
      (r) => r.id !== "gq_existing",
    );
    expect(newRow?.candidateQuestionId).toBe("cq_c1");
    expect(newRow?.id).not.toBe("gq_existing");
  });

  it("concurrency=2 → 전체 결과 수 정상", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
        makeCandidate("cq_c3", "VALID", 3),
        makeCandidate("cq_c4", "VALID", 4),
      ],
      [],
    );
    const content = createFakeContentDb();
    for (const id of ["c1", "c2", "c3", "c4"]) {
      content.helpers.seedCandidate({ id });
    }
    const provider = new MockLlmProvider(happyScript(4));

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 2 },
      { batchDb, contentDb: content.db, provider },
    );

    expect(summary.total).toBe(4);
    expect(summary.results).toHaveLength(4);
    expect(summary.succeeded).toBe(4);
    expect(summary.failed).toBe(0);
    const ids = new Set(summary.results.map((r) => r.candidateId));
    expect(ids.size).toBe(4);
  });
});