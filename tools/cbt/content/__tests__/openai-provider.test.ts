// Provider Guard / retry 테스트 — 실제 네트워크 없이 global fetch를 stub으로 대체한다.
// retry는 pipeline/retry.ts의 withRetry를 사용하며, transient(429/5xx/timeout/network)만
// 재시도하고 terminal(http_client_error/empty_response/malformed_json/schema_validation_failed)은
// 즉시 반환한다. 테스트는 sleep 주입 + backoff 미소값으로 빠르게 돈다.
import { describe, expect, it, afterEach, vi } from "vitest";
import { z } from "zod";
import {
  OpenAiCompatibleProvider,
  classifyHttpStatus,
  parseRetryAfterMs,
  MAX_RETRY_AFTER_WAIT_MS,
} from "../provider/openai";

const TEST_SCHEMA = z.object({
  value: z.number(),
  label: z.string(),
});

type FetchScript = Array<
  | {
      kind: "http";
      ok: boolean;
      status: number;
      statusText?: string;
      body?: unknown;
      headers?: Record<string, string>;
    }
  | { kind: "throw"; error: unknown }
>;

type ResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

function makeHeaderGet(
  headers?: Record<string, string>,
): ResponseLike["headers"] {
  return {
    get(name: string): string | null {
      if (!headers) return null;
      const key = name.toLowerCase();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === key) return v;
      }
      return null;
    },
  };
}

function makeFetch(script: FetchScript): {
  fetch: typeof fetch;
  calls: { url: string; status: number | null }[];
} {
  const calls: { url: string; status: number | null }[] = [];
  const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push({ url: String(input), status: step.kind === "http" ? step.status : null });
    if (step.kind === "throw") throw step.error;
    const headers = makeHeaderGet(step.kind === "http" ? step.headers : undefined);
    const response: ResponseLike = {
      ok: step.kind === "http" ? step.ok : false,
      status: step.kind === "http" ? step.status : 0,
      statusText: step.kind === "http" ? (step.statusText ?? "") : "",
      headers,
      json: async () => {
        if (step.kind !== "http" || step.body === undefined) {
          throw new SyntaxError("Unexpected token...");
        }
        return step.body;
      },
    };
    return response;
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

describe("parseRetryAfterMs", () => {
  const now = () => new Date("2026-08-20T00:00:00Z");

  it("seconds 형식을 ms로 변환한다", () => {
    expect(parseRetryAfterMs("5", now)).toBe(5000);
  });

  it("HTTP-date 형식의 미래 시간을 ms로 변환한다", () => {
    expect(parseRetryAfterMs("2026-08-20T00:00:10Z", now)).toBe(10000);
  });

  it("invalid / 0 / 음수 / 빈 값 / 과거 → undefined (exponential fallback)", () => {
    expect(parseRetryAfterMs("abc", now)).toBeUndefined();
    expect(parseRetryAfterMs("0", now)).toBeUndefined();
    expect(parseRetryAfterMs("-5", now)).toBeUndefined(); // seconds regex 미적용
    expect(parseRetryAfterMs("  ", now)).toBeUndefined();
    expect(parseRetryAfterMs("2026-08-19T00:00:00Z", now)).toBeUndefined(); // 과거
    expect(parseRetryAfterMs(null, now)).toBeUndefined();
  });
});

describe("OpenAiCompatibleProvider — Retry-After", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("429 + Retry-After 1초, 후속 200 → retryAfterMs 반영해 재시도 성공", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429, headers: { "retry-after": "1" } },
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"a"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("429 + Retry-After 0 → exponential fallback 사용", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429, headers: { "retry-after": "0" } },
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"a"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("429 + invalid Retry-After → exponential fallback 사용", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429, headers: { "retry-after": "abc" } },
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"a"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("유효 Retry-After > cap → fail-fast (sleep0, 추가 attempt0)", async () => {
    const seconds = Math.ceil(MAX_RETRY_AFTER_WAIT_MS / 1000) + 1; // cap 초과
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429, headers: { "retry-after": String(seconds) } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limited");
      expect(result.error.retryAfterMs).toBe(seconds * 1000);
    }
    expect(calls).toHaveLength(1); // 추가 attempt 0
  });

  it("503 + Retry-After 2초 → 재시도 성공", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 503, headers: { "retry-after": "2" } },
      { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"a"}' } }] } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("HTTP-date Retry-After (미래) → 재시도 성공", async () => {
    const now = new Date("2026-08-20T00:00:00Z");
    const future = new Date(now.getTime() + 10_000).toISOString();
    const { provider, calls } = makeProvider(
      [
        { kind: "http", ok: false, status: 429, headers: { "retry-after": future } },
        { kind: "http", ok: true, status: 200, body: { choices: [{ message: { content: '{"value":1,"label":"a"}' } }] } },
      ],
      { now: () => new Date(now) },
    );
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("retryAfterMs가 최종 LlmFailure에 보존된다 (재시도 소진 후)", async () => {
    // Retry-After 7s는 cap(60s) 이내 → exponential/Retry-After 결합 지연으로 재시도,
    // maxRetries=2이므로 총 3회 시도 후 최종 failure의 retryAfterMs가 보존된다.
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 429, headers: { "retry-after": "7" } },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retryAfterMs).toBe(7000);
      expect(result.error.status).toBe(429);
    }
    expect(calls).toHaveLength(3); // 1 + maxRetries(2)
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

  it("400 + JSON error body → error.message/type/param/code safe detail 추출", async () => {
    const { provider, calls } = makeProvider([
      {
        kind: "http",
        ok: false,
        status: 400,
        body: {
          error: {
            message: "unsupported parameter",
            type: "invalid_request_error",
            param: "response_format",
            code: "unsupported_param",
          },
        },
      },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("http_client_error");
      expect(result.error.status).toBe(400);
      expect(result.error.detail).toBeDefined();
      expect(result.error.detail).toContain("unsupported parameter");
      expect(result.error.detail).toContain("invalid_request_error");
      expect(result.error.detail).toContain("response_format");
      expect(result.error.detail).toContain("unsupported_param");
    }
    expect(calls).toHaveLength(1);
  });

  it("400 + empty/non-JSON body → detail 없이 기존 http_client_error 유지", async () => {
    const { provider, calls } = makeProvider([
      { kind: "http", ok: false, status: 400, statusText: "Bad Request" },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("http_client_error");
      expect(result.error.status).toBe(400);
      expect(result.error.detail).toBeUndefined();
    }
    expect(calls).toHaveLength(1);
  });

  it("400 + JSON body의 raw/secret은 detail에 노출되지 않는다", async () => {
    const { provider } = makeProvider([
      {
        kind: "http",
        ok: false,
        status: 400,
        body: {
          error: { message: "invalid request" },
          secret_token: "sk-super-secret-value",
          raw_snippet: "some raw response blob",
        },
      },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail).toBeDefined();
      expect(result.error.detail).not.toContain("sk-super-secret-value");
      expect(result.error.detail).not.toContain("some raw response blob");
    }
  });

  it("400 + 긴 error message → detail이 bounded(300자) 처리", async () => {
    const longMessage = "x".repeat(800);
    const { provider } = makeProvider([
      {
        kind: "http",
        ok: false,
        status: 400,
        body: { error: { message: longMessage } },
      },
    ]);
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail).toBeDefined();
      expect(result.error.detail!.length).toBeLessThanOrEqual(300);
    }
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