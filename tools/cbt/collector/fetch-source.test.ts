import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CbtSourceDef } from "../sources.config";
import {
  buildQuestionUrl,
  collectSourceBatch,
  collectSourceId,
  MAX_CONSECUTIVE_FAILURES,
} from "./fetch-source";

const sampleBody = "<html><body><p>화물차 문제 1</p></body></html>";

const configuredSource: CbtSourceDef = {
  sourceName: "LAW",
  category: "CAT-LAW",
  urlTemplate: "https://example.test/questions/{id}",
  idRanges: [{ from: 1, to: 220 }],
  answerLocation: "unknown",
  status: "configured",
};

const plannedSource: CbtSourceDef = {
  sourceName: "LAW",
  category: "CAT-LAW",
  urlTemplate: null,
  idRanges: [{ from: 1, to: 220 }],
  answerLocation: "unknown",
  status: "planned",
};

function fakeResponse(status: number, body = sampleBody): Response {
  return new Response(body, { status });
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

const baseOptions = {
  rawDir: "",
  requestIntervalMs: 0,
  maxRetries: 2,
  timeoutMs: 5000,
  retryBaseDelayMs: 1,
};

let tmpDir = "";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cbt-collect-"));
  baseOptions.rawDir = tmpDir;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildQuestionUrl", () => {
  it("{id} 플레이스홀더를 sourceQuestionId로 치환한다", () => {
    expect(buildQuestionUrl(configuredSource, "LAW-001")).toBe(
      "https://example.test/questions/LAW-001",
    );
  });

  it("urlTemplate이 null이면 null을 반환한다", () => {
    expect(buildQuestionUrl(plannedSource, "LAW-001")).toBeNull();
  });
});

describe("collectSourceId", () => {
  it("200 HTML을 raw/{sourceName}/{sourceQuestionId}.html로 저장한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse(200));

    const result = await collectSourceId(configuredSource, "LAW-001", baseOptions);

    expect(result.kind).toBe("collected");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const file = path.join(tmpDir, "LAW", "LAW-001.html");
    expect(await fs.readFile(file, "utf8")).toBe(sampleBody);
  });

  it("contentHash를 생성한다 (sha256)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeResponse(200));

    const result = await collectSourceId(configuredSource, "LAW-001", baseOptions);

    expect(result.kind).toBe("collected");
    if (result.kind === "collected") {
      expect(result.source.contentHash).toBe(sha256Hex(sampleBody));
    }
  });

  it("동일 HTML이 이미 있으면 재수집하지 않고 skip한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse(200));

    const first = await collectSourceId(configuredSource, "LAW-001", baseOptions);
    expect(first.kind).toBe("collected");

    const second = await collectSourceId(configuredSource, "LAW-001", baseOptions);
    expect(second.kind).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force면 기존 파일이 있어도 재수집한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => fakeResponse(200));

    await collectSourceId(configuredSource, "LAW-001", baseOptions);
    const second = await collectSourceId(configuredSource, "LAW-001", {
      ...baseOptions,
      force: true,
    });

    expect(second.kind).toBe("collected");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429/5xx는 retry 후 성공한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fakeResponse(429))
      .mockResolvedValueOnce(fakeResponse(503))
      .mockResolvedValueOnce(fakeResponse(200));

    const result = await collectSourceId(configuredSource, "LAW-002", baseOptions);

    expect(result.kind).toBe("collected");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("4xx는 retry 없이 즉시 실패로 처리한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse(404));

    const result = await collectSourceId(configuredSource, "LAW-003", baseOptions);

    expect(result.kind).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("network failure는 재시도 후에도 실패하면 failed로 반환한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("fetch failed"));

    const result = await collectSourceId(configuredSource, "LAW-004", {
      ...baseOptions,
      maxRetries: 1,
    });

    expect(result.kind).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("timeout은 재시도 후에도 실패하면 failed로 반환한다", async () => {
    const timeoutError = new DOMException(
      "The operation was aborted",
      "TimeoutError",
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(timeoutError);

    const result = await collectSourceId(configuredSource, "LAW-005", {
      ...baseOptions,
      maxRetries: 1,
    });

    expect(result.kind).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("urlTemplate이 미확정인 source는 실패로 처리한다", async () => {
    const result = await collectSourceId(plannedSource, "LAW-001", baseOptions);
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("User-Agent 헤더를 전달한다", async () => {
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      capturedInit = init;
      return fakeResponse(200);
    });

    await collectSourceId(configuredSource, "LAW-006", {
      ...baseOptions,
      userAgent: "test-agent/1.0",
    });

    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toBe("test-agent/1.0");
  });

  it("기본 User-Agent가 설정된다", async () => {
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      capturedInit = init;
      return fakeResponse(200);
    });

    await collectSourceId(configuredSource, "LAW-007", baseOptions);

    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toContain("gto-cbt-collector");
  });

  it("SourceRef metadata를 생성한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeResponse(200));

    const result = await collectSourceId(configuredSource, "LAW-008", baseOptions);

    expect(result.kind).toBe("collected");
    if (result.kind === "collected") {
      expect(result.source).toEqual({
        sourceName: "LAW",
        originalUrl: "https://example.test/questions/LAW-008",
        fetchedAt: expect.any(String),
        sourceQuestionId: "LAW-008",
        rawSourceFile: "LAW/LAW-008.html",
        rawBlockId: "",
        contentHash: sha256Hex(sampleBody),
      });
      expect(new Date(result.source.fetchedAt as string).toISOString()).toBe(
        result.source.fetchedAt,
      );
    }
  });
});

describe("collectSourceBatch", () => {
  it("요청 간 최소 간격을 유지한다", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      fakeResponse(200),
    );

    const start = Date.now();
    const batch = await collectSourceBatch(
      configuredSource,
      ["LAW-101", "LAW-102", "LAW-103"],
      {
        ...baseOptions,
        requestIntervalMs: 30,
      },
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(batch.results.filter((r) => r.kind === "collected")).toHaveLength(3);
  });

  it("연속 실패가 MAX_CONSECUTIVE_FAILURES에 도달하면 source를 중단한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse(500));

    const ids = Array.from(
      { length: MAX_CONSECUTIVE_FAILURES + 1 },
      (_, i) => `LAW-${String(100 + i).padStart(3, "0")}`,
    );

    const batch = await collectSourceBatch(configuredSource, ids, {
      ...baseOptions,
      maxRetries: 0,
    });

    expect(batch.stopped).toBe(true);
    expect(batch.results).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(batch.consecutiveFailures).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(batch.results.every((r) => r.kind === "failed")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES);
  });

  it("실패가 연속이 아니면 source가 계속 진행된다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fakeResponse(500))
      .mockResolvedValueOnce(fakeResponse(500))
      .mockImplementation(async () => fakeResponse(200));

    const batch = await collectSourceBatch(
      configuredSource,
      ["LAW-001", "LAW-002", "LAW-003", "LAW-004"],
      { ...baseOptions, maxRetries: 0 },
    );

    expect(batch.stopped).toBe(false);
    expect(batch.results.filter((r) => r.kind === "collected")).toHaveLength(2);
    expect(batch.consecutiveFailures).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
