/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CBT_SOURCES } from "../../sources.config";
import { createSnippetStorage } from "../../persist/snippet-storage";
import { createFakePersistDb, type FakePersistDb } from "../../persist/__tests__/fakePrisma";
import { runBatchIngest } from "../ingest";

const NEWBT_SOURCE = CBT_SOURCES.find((s) => s.sourceName === "NEWBT-HWMUL")!;

function fixtureHtml(): string {
  return readFileSync(
    new URL("../../extractor/__fixtures__/newbt-question.html", import.meta.url),
    "utf8",
  );
}

async function seedRawFiles(rawDir: string, ids: string[]): Promise<void> {
  const sourceDir = path.join(rawDir, NEWBT_SOURCE.sourceName);
  await mkdir(sourceDir, { recursive: true });
  for (const id of ids) {
    await writeFile(path.join(sourceDir, `${id}.html`), fixtureHtml(), "utf8");
  }
}

async function makeTmpDirs() {
  const root = await mkdtemp(path.join(os.tmpdir(), "batch-ingest-"));
  const rawDir = path.join(root, "raw");
  const snippetsDir = path.join(root, "snippets");
  return { root, rawDir, snippetsDir };
}

function countCreated(db: FakePersistDb): number {
  return db.store.candidateQuestions.length;
}

describe("runBatchIngest", () => {
  it("3건 관통 → 전부 persisted (created=true)", async () => {
    const { root, rawDir, snippetsDir } = await makeTmpDirs();
    try {
      const ids = ["92628", "92631", "92633"];
      await seedRawFiles(rawDir, ids);
      const fake = createFakePersistDb();

      const summary = await runBatchIngest(
        {
          source: NEWBT_SOURCE,
          ids,
          limit: 3,
          force: false,
        },
        { db: fake.db, storage: createSnippetStorage(snippetsDir), rawDir, runLogDir: path.join(root, "runs") },
      );

      expect(summary.total).toBe(3);
      expect(summary.succeeded).toBe(3);
      expect(summary.failed).toBe(0);
      expect(summary.results.every((r) => r.outcome === "persisted")).toBe(true);
      expect(summary.results.every((r) => r.created === true)).toBe(true);
      expect(countCreated(fake)).toBe(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("재실행 시 created=false (idempotent upsert)", async () => {
    const { root, rawDir, snippetsDir } = await makeTmpDirs();
    try {
      const ids = ["92628"];
      await seedRawFiles(rawDir, ids);
      const fake = createFakePersistDb();
      const deps = { db: fake.db, storage: createSnippetStorage(snippetsDir), rawDir, runLogDir: path.join(root, "runs") };

      const first = await runBatchIngest({ source: NEWBT_SOURCE, ids, limit: 1 }, deps);
      const second = await runBatchIngest({ source: NEWBT_SOURCE, ids, limit: 1 }, deps);

      expect(first.results[0].created).toBe(true);
      expect(second.results[0].created).toBe(false);
      expect(second.results[0].outcome).toBe("persisted");
      expect(countCreated(fake)).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("limit=2이면 2건만 처리한다", async () => {
    const { root, rawDir, snippetsDir } = await makeTmpDirs();
    try {
      const ids = ["92628", "92631", "92633"];
      await seedRawFiles(rawDir, ids);
      const fake = createFakePersistDb();

      const summary = await runBatchIngest(
        { source: NEWBT_SOURCE, ids, limit: 2 },
        { db: fake.db, storage: createSnippetStorage(snippetsDir), rawDir, runLogDir: path.join(root, "runs") },
      );

      expect(summary.total).toBe(2);
      expect(countCreated(fake)).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("dry-run → DB persist 0회 (raw 캐시만 사용)", async () => {
    const { root, rawDir, snippetsDir } = await makeTmpDirs();
    try {
      const ids = ["92628", "92631"];
      await seedRawFiles(rawDir, ids);
      const fake = createFakePersistDb();

      const summary = await runBatchIngest(
        { source: NEWBT_SOURCE, ids, limit: 2, dryRun: true },
        { db: fake.db, storage: createSnippetStorage(snippetsDir), rawDir, runLogDir: path.join(root, "runs") },
      );

      expect(summary.total).toBe(2);
      expect(countCreated(fake)).toBe(0);
      expect(summary.results.every((r) => r.outcome !== "persisted")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("한 건 persist 실패 → 해당 건 failed, 나머지는 계속 처리", async () => {
    const { root, rawDir, snippetsDir } = await makeTmpDirs();
    try {
      const ids = ["92628", "92631", "92633"];
      await seedRawFiles(rawDir, ids);
      const fake = createFakePersistDb();

      // 92631에 대해 persist(create) 실패 주입 — 나머지 건은 정상 처리되어야 한다.
      const failing = fake.db.candidateQuestion.create;
      fake.db.candidateQuestion.create = (async (args: any) => {
        if (args?.data?.sourceQuestionId === "92631") {
          throw new Error("injected persist failure");
        }
        return failing(args as never) as ReturnType<typeof failing>;
      }) as typeof failing;

      const summary = await runBatchIngest(
        { source: NEWBT_SOURCE, ids, limit: 3 },
        { db: fake.db, storage: createSnippetStorage(snippetsDir), rawDir, runLogDir: path.join(root, "runs") },
      );

      expect(summary.total).toBe(3);
      expect(summary.failed).toBe(1);
      expect(summary.succeeded).toBe(2);
      const failed = summary.results.find((r) => r.sourceQuestionId === "92631");
      expect(failed?.outcome).toBe("failed");
      expect(failed?.error).toContain("injected persist failure");
      expect(countCreated(fake)).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
