// Provider Guard / retry 테스트 — 실제 네트워크 없이 global fetch를 stub으로 대체한다.
// retry는 pipeline/retry.ts의 withRetry를 사용하며, transient(429/5xx/timeout/network)만
// 재시도하고 terminal(http_client_error/empty_response/malformed_json/schema_validation_failed)은
// 즉시 반환한다. 테스트는 sleep 주입 + backoff 미소값으로 빠르게 돈다.
import { describe, expect, it, afterEach, vi } from "vitest";
import { z } from "zod";
import { OpenAiCompatibleProvider, classifyHttpStatus } from "../provider/openai";

const TEST_SCHEMA = z.object({
  value: z.number(),
  label: z.string(),
});

type FetchScript = Array<
  | { kind: "http"; ok: boolean; status: number; statusText?: string; body?: unknown }
  | { kind: "throw"; error: unknown }
>;

function jsonable(resp: ResponseLike): ResponseLike {
  return resp;
}

type ResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
};

function makeFetch(script: FetchScript): {
  fetch: typeof fetch;
  calls: { url: string; status: number | null }[];
} {
  const calls: { url: string; status: number | null }[] = [];
  const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push({ url: String(input), status: step.kind === "http" ? step.status : null });
    if (step.kind === "throw") throw step.error;
    const response: ResponseLike = {
      ok: step.ok,
      status: step.status,
      statusText: step.statusText ?? "",
      json: async () => {
        if (step.body === undefined) {
          throw new SyntaxError("Unexpected token...");
        }
        return step.body;
      },
    };
    if (!step.ok) {
      return jsonable({
        ok: false,
        status: step.status,
        statusText: step.statusText ?? "",
        json: async () => ({}),
      });
    }
    return jsonable(response);
  }) as unknown as typeof fetch;
  return { fetch: mockFetch, calls };
}

function makeProvider(script: FetchScript, overrides: Partial<ConstructorParameters<typeof OpenAiCompatibleProvider>[0]> = {}) {
  const { fetch, calls } = makeFetch(script);
  vi.stubGlobal("fetch", fetch);
  const provider = new OpenAiCompatibleProvider({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 1000,
    maxRetries: 2,
    backoffBaseMs: 1,
    sleep: async () => {},
    ...overrides,
  });
  return { provider, calls, fetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("classifyHttpStatus", () => {
  it("429 → rate_limited, 5xx → server_error, 그 외 4xx → http_client_error", () => {
    expect(classifyHttpStatus(429)).toBe("rate_limited");
    expect(classifyHttpStatus(500)).toBe("server_error");
    expect(classifyHttpStatus(503)).toBe("server_error");
    expect(classifyHttpStatus(401)).toBe("http_client_error");
    expect(classifyHttpStatus(400)).toBe("http_client_error");
  });
});

describe("OpenAiCompatibleProvider — retry (pipeline/retry.ts 재사용)", () => {
  it("429가 먼저 오고 200 후속 성공 → rate_limited 후 재시도 성공", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429 },
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"a"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("전부 429면 재시도 소진 후 rate_limited 반환 (호출 = maxRetries+1)", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429 },
      { kind: "http", ok: false, status: 429 },
      { kind: "http", ok: false, status: 429 },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limited");
      expect(result.error.status).toBe(429);
    }
    expect(calls).toHaveLength(3); // 1 + 2 retry
  });

  it("5xx도 transient — 소진 시 server_error 반환", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 503 },
      { kind: "http", ok: false, status: 503 },
      { kind: "http", ok: false, status: 503 },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("server_error");
    expect(calls).toHaveLength(3);
  });

  it("네트워크 오류(TypeError)도 transient — 소진 시 provider_error", async () => {
    const { provider, calls } = makeProvider([
      { kind: "throw", error: new TypeError("fetch failed") },
      { kind: "throw", error: new TypeError("fetch failed") },
      { kind: "throw", error: new TypeError("fetch failed") },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("provider_error");
    expect(calls).toHaveLength(3);
  });

  it("timeout(AbortError)도 transient — 소진 시 timeout", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const { provider, calls } = makeProvider([
      { kind: "throw", error: abort },
      { kind: "throw", error: abort },
      { kind: "throw", error: abort },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("timeout");
    expect(calls).toHaveLength(3);
  });
});

describe("OpenAiCompatibleProvider — terminal(재시도 금지)", () => {
  it("HTTP 400(http_client_error) → 즉시 반환, 재시도 없음", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 400, statusText: "Bad Request" },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("http_client_error");
      expect(result.error.status).toBe(400);
    }
    expect(calls).toHaveLength(1);
  });

  it("content 부재/빈 문자열 → empty_response, 재시도 없음", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: {} }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty_response");
    expect(calls).toHaveLength(1);
  });

  it("응답 JSON 파싱 실패 → malformed_json, 재시도 없음", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: true, status: 200, body: undefined },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("malformed_json");
    expect(calls).toHaveLength(1);
  });

  it("schema 검증 실패 → schema_validation_failed, 재시도 없음", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":"not-a-number","label":"a"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema_validation_failed");
    expect(calls).toHaveLength(1);
  });

  it("정상 응답 → ok:true", async () => {
    const { provider } = makeProvider([
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"ok"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
  });
});