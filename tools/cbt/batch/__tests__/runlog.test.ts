// Phase 0 D — durable run log / runId (fail-closed) 테스트.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendRunLogEntry,
  createRunId,
  openRunLog,
  readRunLog,
  RunLogError,
} from "../runlog";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "cbt-runlog-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function start(runId: string) {
  return {
    type: "run_start" as const,
    runId,
    command: "batch-generate",
    args: ["--limit=2"],
    targets: ["t1", "t2"],
    total: 2,
    createdAt: new Date().toISOString(),
  };
}

describe("openRunLog", () => {
  it("runId JSONL 파일을 생성하고 run_start를 기록한다", async () => {
    const runId = createRunId();
    const { filePath } = await openRunLog(dir, start(runId));
    await access(filePath);
    const content = await readFile(filePath, "utf8");
    expect(content.trim()).toContain('"type":"run_start"');
  });

  it("file명에 쓸 수 없는 runId는 거부한다 (경로 탈출 방지)", async () => {
    await expect(openRunLog(dir, { ...start("a/b"), runId: "a/../evil" })).rejects.toThrow(
      RunLogError,
    );
  });

  it("디렉터리를 만들 수 없는 경우 fail-closed로 throw한다", async () => {
    // 상위 경로가 파일이어서 디렉터리 생성이 불가능한 상황
    const blocker = path.join(dir, "blocker");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(blocker, "i am a file", "utf8");
    const invalidDir = path.join(blocker, "sub");
    await expect(openRunLog(invalidDir, start("x1"))).rejects.toThrow(RunLogError);
  });
});

describe("appendRunLogEntry", () => {
  it("아이템 결과를 순서대로 append한다", async () => {
    const runId = createRunId();
    await openRunLog(dir, start(runId));
    await appendRunLogEntry(dir, {
      type: "item_result",
      runId,
      itemId: "t1",
      outcome: "succeeded",
      at: new Date().toISOString(),
    });
    await appendRunLogEntry(dir, {
      type: "item_result",
      runId,
      itemId: "t2",
      outcome: "failed",
      detail: "candidate not found",
      at: new Date().toISOString(),
    });
    const read = await readRunLog(dir, runId);
    expect(read.entries.filter((e) => e.type === "item_result")).toHaveLength(2);
    expect(read.failedItemIds).toEqual(["t2"]);
  });

  it("수동 조작된 runId는 거부한다", async () => {
    await expect(
      appendRunLogEntry(dir, {
        type: "item_result",
        runId: "../escape",
        itemId: "t",
        outcome: "failed",
        at: new Date().toISOString(),
      }),
    ).rejects.toThrow(RunLogError);
  });
});

describe("readRunLog", () => {
  it("run_start targets, failedItemIds, run_end를 복원한다", async () => {
    const runId = createRunId();
    await openRunLog(dir, start(runId));
    await appendRunLogEntry(dir, { type: "run_end", runId, succeeded: 1, failed: 1, durationMs: 3, endedAt: new Date().toISOString() });
    const read = await readRunLog(dir, runId);
    expect(read.targets).toEqual(["t1", "t2"]);
    expect(read.runEnd?.failed).toBe(1);
    expect(read.runStart.type).toBe("run_start");
  });

  it("존재하지 않는 runId → throw", async () => {
    await expect(readRunLog(dir, "missing-run")).rejects.toThrow(
      "run log를 찾을 수 없습니다",
    );
  });

  it("손상된 JSON 라인 → throw (resume 신뢰성)", async () => {
    const runId = createRunId();
    await openRunLog(dir, start(runId));
    const filePath = path.join(dir, `${runId}.jsonl`);
    await rm(filePath);
    const { appendFile } = await import("node:fs/promises");
    await appendFile(filePath, '{"type":"broken"\n', "utf8");
    await expect(readRunLog(dir, runId)).rejects.toThrow(RunLogError);
  });
});
