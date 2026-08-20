/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 9 — batch-generate orchestration 테스트.
// runBatchGenerate는 실제 로직(listGenerationTargets + runPool + runContentProduction)을
// fake batch DB / fake content DB / MockLlmProvider로 검증한다.
// LLM·DB write는 dry-run에서 0회, 실패는 batch를 중단시키지 않는다.
// durable run log는 임시 디렉터리에 쓴다 (fail-closed 동작 포함).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MOCK_GENERATED_QUESTION, MOCK_QA_PASS } from "../../content/provider";
import { MockLlmProvider, type MockScript } from "../../content/provider/mock";
import {
  parseStructuredResponse,
  type LlmProvider,
  type ZodSchema,
} from "../../content/provider/types";
import { AUTO_QA_PROMPT_VERSION } from "../../content/schemas";
import { qaPassPayload } from "../../content/__tests__/helpers";
import { createFakeContentDb } from "../../content/__tests__/fakeContentDb";
import { runBatchGenerate } from "../generate";
import { CircuitBreaker } from "../breaker";
import { appendRunLogEntry, RunLogError } from "../runlog";
import type { BatchCandidateDb } from "../candidate-query";
import type { CandidateQuestion } from "@/generated/prisma/client";

type Row = {
  id: string;
  validationStatus: string;
  createdAt: Date;
  [key: string]: unknown;
};

type GqRow = { candidateQuestionId: string; status: string };

let runLogDir: string;
beforeAll(async () => {
  runLogDir = await mkdtemp(path.join(os.tmpdir(), "cbt-gen-runlog-"));
});
afterAll(async () => {
  await rm(runLogDir, { recursive: true, force: true });
});

function makeCandidate(id: string, validationStatus: string, createdAt: number): Row {
  return { id, validationStatus, createdAt: new Date(createdAt) };
}

/** BatchCandidateDb 최소 fake — listGenerationTargets가 쓰는 where/select/orderBy만 처리 */
function createFakeBatchDb(
  candidates: Row[],
  generatedRows: Array<GqRow | string>,
) {
  const generated: GqRow[] = generatedRows.map((row) =>
    typeof row === "string" ? { candidateQuestionId: row, status: "QA_PASSED" } : row,
  );
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
        if (where.category) {
          rows = rows.filter((r) => r.category === where.category);
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
          return generated;
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
      { batchDb, contentDb: content.db, provider, runLogDir },
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
      { batchDb, contentDb: content.db, provider, runLogDir },
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
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(summary.succeeded).toBe(0);
    expect(summary.results).toHaveLength(0);
    expect(provider.calls).toBe(0);
    expect(content.store.generatedQuestions).toHaveLength(0);
  });

  it("dry-run → 카테고리 분포 로그 (여러 category)", async () => {
    const batchDb = createFakeBatchDb(
      [
        { ...makeCandidate("cq_c1", "VALID", 1), category: "CAT-A" },
        { ...makeCandidate("cq_c2", "VALID", 2), category: "CAT-B" },
        { ...makeCandidate("cq_c3", "VALID", 3), category: "CAT-A" },
      ],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    content.helpers.seedCandidate({ id: "c2" });
    content.helpers.seedCandidate({ id: "c3" });
    const provider = new MockLlmProvider(happyScript(1));
    const logs: string[] = [];

    await runBatchGenerate(
      { limit: 10, dryRun: true },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        logger: {
          info: (msg) => logs.push(msg),
          warn: () => {},
          error: () => {},
          progress: () => {},
        },
      },
    );

    const dist = logs.find((l) => l.startsWith("dry-run: 카테고리 분포"));
    expect(dist).toBe("dry-run: 카테고리 분포 CAT-A=2 CAT-B=1");
    expect(provider.calls).toBe(0); // LLM write 0
    expect(content.store.generatedQuestions).toHaveLength(0); // DB write 0
  });

  it("dry-run → --category 필터 후 단일 카테고리 분포", async () => {
    const batchDb = createFakeBatchDb(
      [
        { ...makeCandidate("cq_c1", "VALID", 1), category: "CAT-A" },
        { ...makeCandidate("cq_c2", "VALID", 2), category: "CAT-A" },
        { ...makeCandidate("cq_c3", "VALID", 3), category: "CAT-B" },
      ],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    content.helpers.seedCandidate({ id: "c2" });
    content.helpers.seedCandidate({ id: "c3" });
    const provider = new MockLlmProvider(happyScript(1));
    const logs: string[] = [];

    await runBatchGenerate(
      { limit: 10, dryRun: true, category: "CAT-A" },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        logger: {
          info: (msg) => logs.push(msg),
          warn: () => {},
          error: () => {},
          progress: () => {},
        },
      },
    );

    const dist = logs.find((l) => l.startsWith("dry-run: 카테고리 분포"));
    expect(dist).toBe("dry-run: 카테고리 분포 CAT-A=2");
    expect(provider.calls).toBe(0);
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
      { batchDb, contentDb: content.db, provider, runLogDir },
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
      { batchDb, contentDb: content.db, provider, runLogDir },
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
      { batchDb, contentDb: content.db, provider, runLogDir },
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
    // concurrency=2에서 호출 순서와 무관하게 동작하도록 stateless provider를 쓴다:
    // QA prompt(auto-qa v3.1)면 MOCK_QA_PASS, 그 외(생성)면 MOCK_GENERATED_QUESTION.
    const provider: LlmProvider = {
      provider: "mock",
      model: "mock-model",
      async generateStructured<T>(
        _prompt: string,
        schema: ZodSchema<T>,
        options?: { promptVersion?: string },
      ) {
        const data =
          options?.promptVersion === AUTO_QA_PROMPT_VERSION
            ? MOCK_QA_PASS
            : MOCK_GENERATED_QUESTION;
        return parseStructuredResponse(JSON.stringify(data), schema, {
          provider: "mock",
          model: "mock-model",
          promptVersion: options?.promptVersion ?? "unknown",
        });
      },
    };

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 2 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(summary.total).toBe(4);
    expect(summary.results).toHaveLength(4);
    expect(summary.succeeded).toBe(4);
    expect(summary.failed).toBe(0);
    const ids = new Set(summary.results.map((r) => r.candidateId));
    expect(ids.size).toBe(4);
  });
});

describe("runBatchGenerate — run log fail-closed (Phase 0 D)", () => {
  it("start append 실패 → DB/LLM 쓰기 전에 거부한다 (reject)", async () => {
    const batchDb = createFakeBatchDb(
      [makeCandidate("cq_c1", "VALID", 1)],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    const provider = new MockLlmProvider(happyScript(1));

    // runLogDir를 파일로 만들어 openRunLog(mkdir/append)를 실패시킨다 (fail-closed)
    const blockerDir = path.join(runLogDir, "blocked-run");
    await import("node:fs/promises").then((m) => m.writeFile(blockerDir, "not a dir", "utf8"));

    await expect(
      runBatchGenerate(
        { limit: 10, concurrency: 1 },
        { batchDb, contentDb: content.db, provider, runLogDir: blockerDir },
      ),
    ).rejects.toThrow(RunLogError);
    expect(provider.calls).toBe(0); // LLM 호출 전에 거부됨
  });

  it("mid-run append 실패 → 신규 항목 스케줄링 중단, aborted(log_failure) 요약으로 종료", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
        makeCandidate("cq_c3", "VALID", 3),
      ],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    content.helpers.seedCandidate({ id: "c2" });
    content.helpers.seedCandidate({ id: "c3" });
    const provider = new MockLlmProvider(happyScript(3));

    // item_result append만 실패 → 첫 항목 기록 후 broken
    let itemAppends = 0;
    const appendRunLog = async (_dir: string, entry: any) => {
      if (entry.type === "item_result") {
        itemAppends += 1;
        if (itemAppends === 1) throw new RunLogError("simulated mid-run append failure");
      }
      await appendRunLogEntry(runLogDir, entry);
    };

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir, appendRunLog },
    );

    // 첫 항목만 처리되었고, 이후 항목은 LLM 호출 없이 스케줄링 중단
    expect(provider.calls).toBe(2); // cq_c1만 generation+QA
    expect(summary.failed).toBe(3); // runlog_append_failed + broken 2건
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toBe("log_failure");
  });
});

describe("runBatchGenerate — safety re-entry (Phase 0 E)", () => {
  it("FAILED GQ만 있는 candidate는 재시도되고, 정상 GQ는 계속 스킵된다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_retry", "VALID", 1),
        makeCandidate("cq_normal", "VALID", 2),
      ],
      [
        { candidateQuestionId: "cq_retry", status: "FAILED" },
        { candidateQuestionId: "cq_normal", status: "QA_PASSED" },
      ],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "retry" });
    content.helpers.seedCandidate({ id: "normal" });
    const provider = new MockLlmProvider(happyScript(1)); // 1건만 LLM 2회

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(summary.skipped).toBe(1); // cq_normal
    expect(summary.total).toBe(1); // cq_retry만 대상
    expect(summary.results.map((r) => r.candidateId)).toEqual(["cq_retry"]);
    expect(summary.succeeded).toBe(1);
    expect(provider.calls).toBe(2);
  });

  it("QA_FAILED만 있는 candidate도 재시도 대상이다", async () => {
    const batchDb = createFakeBatchDb(
      [makeCandidate("cq_qafail", "VALID", 1)],
      [{ candidateQuestionId: "cq_qafail", status: "QA_FAILED" }],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "qafail" });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(summary.total).toBe(1);
    expect(summary.skipped).toBe(0);
  });
});

describe("runBatchGenerate — 명시 선택 (Phase 0 E)", () => {
  it("--ids: 입력 순서대로 대상 선정, REJECTED는 제외된다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_b", "REJECTED", 1),
        makeCandidate("cq_c", "VALID", 1),
        makeCandidate("cq_a", "VALID", 1),
      ],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "b" });
    content.helpers.seedCandidate({ id: "c" });
    content.helpers.seedCandidate({ id: "a" });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { ids: "cq_c,cq_b", limit: null, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(summary.total).toBe(1); // cq_b(REJECTED)는 대상에서 제외
    expect(summary.results.map((r) => r.candidateId)).toEqual(["cq_c"]);
    expect(provider.calls).toBe(2); // cq_c만 generation+QA
  });

  it("--ids: REJECTED만 명시하면 대상 없음 오류", async () => {
    const batchDb = createFakeBatchDb(
      [makeCandidate("cq_b", "REJECTED", 1)],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "b" });
    const provider = new MockLlmProvider(happyScript(1));

    await expect(
      runBatchGenerate(
        { ids: "cq_b", limit: null, concurrency: 1 },
        { batchDb, contentDb: content.db, provider, runLogDir },
      ),
    ).rejects.toThrow("명시한 ID 중 대상 candidate가 없습니다");
    expect(provider.calls).toBe(0); // 대상 없음 → LLM 호출 없음
  });

  it("--category: 범위 내 카테고리만 대상, REJECTED 제외", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_hand", "VALID", 1),
        makeCandidate("cq_safe", "VALID", 2),
        makeCandidate("cq_rejected", "REJECTED", 3),
      ],
      [],
    );
    (batchDb.candidateQuestion as any).findMany = async (args: any) => {
      const where = args?.where ?? {};
      let rows = [
        makeCandidate("cq_hand", "VALID", 1),
        makeCandidate("cq_safe", "VALID", 2),
        makeCandidate("cq_rejected", "REJECTED", 3),
      ];
      rows.forEach((r) => {
        r.category = r.id === "cq_hand" ? "CAT-HANDLING" : "CAT-OTHER";
      });
      if (where.validationStatus?.not) {
        rows = rows.filter((r) => r.validationStatus !== where.validationStatus.not);
      }
      if (where.category) {
        rows = rows.filter((r) => r.category === where.category);
      }
      return rows as unknown as CandidateQuestion[];
    };
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "hand" });
    content.helpers.seedCandidate({ id: "safe" });
    content.helpers.seedCandidate({ id: "rejected" });
    const provider = new MockLlmProvider(happyScript(1));

    const summary = await runBatchGenerate(
      { category: "CAT-HANDLING", limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(summary.total).toBe(1);
    expect(summary.results.map((r) => r.candidateId)).toEqual(["cq_hand"]);
  });
});

describe("runBatchGenerate — resume (Phase 0 E)", () => {
  it("이전 run의 실패 건만 재진입 대상으로 재입력된다", async () => {
    const batchDb = createFakeBatchDb(
      [makeCandidate("cq_ok", "VALID", 1), makeCandidate("cq_missing", "VALID", 2)],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "ok" }); // cq_missing은 없음 → 실패
    const provider = new MockLlmProvider(happyScript(1));

    const first = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    expect(first.failed).toBe(1);
    expect(first.runId).toBeTruthy();

    const resumed = await runBatchGenerate(
      { resume: first.runId!, limit: null, concurrency: 1 },
      { batchDb, contentDb: content.db, provider, runLogDir },
    );

    // resume는 실패한 cq_missing만 명시 대상으로 다시 선택한다
    expect(resumed.total).toBe(1);
    expect(resumed.results.map((r) => r.candidateId)).toEqual(["cq_missing"]);
    expect(resumed.results[0]?.outcome).toBe("failed");
  });

  it("--resume과 --force 동시 사용은 readRunLog/DB write/provider 전에 거부된다", async () => {
    const batchDb = createFakeBatchDb(
      [makeCandidate("cq_c1", "VALID", 1)],
      [],
    );
    const content = createFakeContentDb();
    content.helpers.seedCandidate({ id: "c1" });
    const provider = new MockLlmProvider(happyScript(1));

    // 존재하지 않는 runId로 호출해도 guard가 readRunLog보다 먼저 throw하므로
    // 실제 runId 파일이 필요 없다 (LLM/DB 호출도 0).
    await expect(
      runBatchGenerate(
        { resume: "no-such-run", force: true, limit: 10, concurrency: 1 },
        { batchDb, contentDb: content.db, provider, runLogDir },
      ),
    ).rejects.toThrow("--resume과 --force는 함께 사용할 수 없습니다");
    expect(provider.calls).toBe(0);
    expect(content.store.generatedQuestions).toHaveLength(0);
  });
});

describe("runBatchGenerate — 이중 breaker 회귀 (provider 5 / semantic 10)", () => {
  function seed2(batchDb: any, content: any) {
    [["cq_c1", "c1"], ["cq_c2", "c2"]].forEach(([, c]) => {
      content.helpers.seedCandidate({ id: c });
    });
    return batchDb;
  }

  it("transient timeout가 providerBreaker를 열어 다음 호출을 단락한다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
      ],
      [],
    );
    const content = createFakeContentDb();
    seed2(batchDb, content);
    const provider = new MockLlmProvider({ kind: "timeout" });
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
    });

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        providerBreaker,
        semanticBreaker,
      },
    );

    // cq_c1은 timeout(transient)으로 FAILED → providerBreaker open
    // cq_c2는 breaker open → LLM 호출 없이 circuit_open
    expect(provider.calls).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.results[1].error).toContain("circuit_open");
    expect(providerBreaker.status().state).toBe("open");
  });

  it("semantic QA_FAILED(errorCode null)가 semanticBreaker를 열어 다음 호출을 단락한다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
      ],
      [],
    );
    const content = createFakeContentDb();
    seed2(batchDb, content);
    // generation 정상 + QA pass:false (semantic 평가 탈락, errorCode null)
    const provider = new MockLlmProvider([
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: { ...qaPassPayload(), pass: false } },
    ]);
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        providerBreaker,
        semanticBreaker,
      },
    );

    // cq_c1 → QA_FAILED(semantic)로 semanticBreaker open
    // cq_c2 → semanticBreaker open 단락
    expect(summary.results[0].status).toBe("QA_FAILED");
    expect(summary.failed).toBe(2); // cq_c1은 failed 결과 + circuit_open
    expect(summary.results[1].error).toContain("circuit_open");
    expect(semanticBreaker.status().state).toBe("open");
    // provider transient에는 영향 없음
    expect(providerBreaker.status().state).toBe("closed");
    expect(providerBreaker.status().consecutiveFailures).toBe(0);
  });

  it("QA_PASSED가 providerBreaker 연속 카운터를 reset한다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
        makeCandidate("cq_c3", "VALID", 3),
      ],
      [],
    );
    const content = createFakeContentDb();
    for (const c of ["c1", "c2", "c3"]) content.helpers.seedCandidate({ id: c });
    // cq_c1: timeout(transient → provider+1), cq_c2/cq_c3: QA_PASSED(reset)
    const provider = new MockLlmProvider([
      { kind: "timeout" },
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: MOCK_QA_PASS },
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: MOCK_QA_PASS },
    ]);
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
    });

    await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        providerBreaker,
        semanticBreaker,
      },
    );

    // timeout 1회 → count 1, QA_PASSED 2회 → 0으로 reset
    expect(providerBreaker.status().consecutiveFailures).toBe(0);
    expect(providerBreaker.status().state).toBe("closed");
  });

  it("QA_PASSED가 semanticBreaker 연속 카운터를 reset한다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
        makeCandidate("cq_c3", "VALID", 3),
      ],
      [],
    );
    const content = createFakeContentDb();
    for (const c of ["c1", "c2", "c3"]) content.helpers.seedCandidate({ id: c });
    // cq_c1: semantic QA_FAILED(+1), cq_c2/cq_c3: QA_PASSED(reset)
    const provider = new MockLlmProvider([
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: { ...qaPassPayload(), pass: false } },
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: MOCK_QA_PASS },
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: MOCK_QA_PASS },
    ]);
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
    });

    await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        providerBreaker,
        semanticBreaker,
      },
    );

    // semantic QA_FAILED 1회 → count 1, QA_PASSED 2회 → 0으로 reset
    expect(semanticBreaker.status().consecutiveFailures).toBe(0);
    expect(semanticBreaker.status().state).toBe("closed");
    // provider는 QA_FAILED/QA_PASSED 모두 정상 응답 → 카운터 0 유지
    expect(providerBreaker.status().consecutiveFailures).toBe(0);
  });

  it("terminal(http_client_error/malformed_json/empty_response)은 providerBreaker에 계수/리셋하지 않는다", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
        makeCandidate("cq_c3", "VALID", 3),
      ],
      [],
    );
    const content = createFakeContentDb();
    for (const c of ["c1", "c2", "c3"]) content.helpers.seedCandidate({ id: c });
    const provider = new MockLlmProvider([
      { kind: "http_client_error" },
      { kind: "malformed_json" },
      { kind: "empty_response" },
    ]);
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        providerBreaker,
        semanticBreaker,
      },
    );

    // 세 candidate 모두 terminal → providerBreaker 열리지 않음 → 전부 실제 호출되었어야 한다
    expect(provider.calls).toBe(3);
    expect(summary.results.every((r) => !r.error?.includes("circuit_open"))).toBe(
      true,
    );
    expect(providerBreaker.status().state).toBe("closed");
    expect(providerBreaker.status().consecutiveFailures).toBe(0);
    expect(semanticBreaker.status().state).toBe("closed");
    expect(semanticBreaker.status().consecutiveFailures).toBe(0);
  });

  it("uncategorized throw는 providerBreaker에 계수하지 않는다 (candidate not found)", async () => {
    const batchDb = createFakeBatchDb(
      [
        makeCandidate("cq_c1", "VALID", 1),
        makeCandidate("cq_c2", "VALID", 2),
      ],
      [],
    );
    const content = createFakeContentDb(); // contentDb에 후보 없음 → throw
    const provider = new MockLlmProvider({ kind: "timeout" });
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });

    const summary = await runBatchGenerate(
      { limit: 10, concurrency: 1 },
      {
        batchDb,
        contentDb: content.db,
        provider,
        runLogDir,
        providerBreaker,
        semanticBreaker,
      },
    );

    // 후보 미존재 throw는 provider transient가 아니므로 breaker를 열지 않는다
    expect(summary.failed).toBe(2);
    expect(summary.results.every((r) => r.error?.includes("candidate not found"))).toBe(
      true,
    );
    expect(summary.results.every((r) => !r.error?.includes("circuit_open"))).toBe(
      true,
    );
    expect(providerBreaker.status().state).toBe("closed");
    expect(providerBreaker.status().consecutiveFailures).toBe(0);
    expect(provider.calls).toBe(0);
  });
});