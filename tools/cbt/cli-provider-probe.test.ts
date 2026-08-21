import { describe, expect, it, vi } from "vitest";
import { runProviderProbe } from "./cli-provider-probe";
import type { LlmProvider } from "./content/provider/types";
import type { StructuredGenerationResult } from "./content/provider/types";

type FakeConfig =
  | { kind: "ok" }
  | {
      kind: "rate_limited";
      retryAfterMs?: number;
      status?: number;
      detail?: string;
    };

function makeFakeProvider(config: FakeConfig): {
  provider: LlmProvider;
  generateCalls: () => number;
} {
  let calls = 0;
  const provider = {
    provider: "openai-compatible",
    model: "fake-model",
    generateStructured: <T,>(
      _prompt: string,
      _schema: unknown,
      _options?: { promptVersion?: string },
    ): Promise<StructuredGenerationResult<T>> => {
      calls += 1;
      if (config.kind === "ok") {
        return Promise.resolve({
          ok: true,
          data: { ok: true } as unknown as T,
          rawResponse: '{"ok":true}',
        });
      }
      return Promise.resolve({
        ok: false,
        error: {
          code: "rate_limited",
          message: "fake rate limited",
          rawResponse: null,
          status: config.status ?? 429,
          retryAfterMs: config.retryAfterMs,
          detail: "detail" in config ? config.detail : undefined,
          provider: "openai-compatible",
          model: "fake-model",
          promptVersion: "provider-readiness-v1",
        },
      });
    },
  } as unknown as LlmProvider;
  return {
    provider,
    generateCalls: () => calls,
  };
}

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    progress: vi.fn(),
  };
}

describe("runProviderProbe — usage", () => {
  it("둘 다 없으면 usage 오류 (exit 1)", async () => {
    const code = await runProviderProbe([], {}, silentLogger());
    expect(code).toBe(1);
  });

  it("둘 다 있으면 usage 오류 (exit 1)", async () => {
    const code = await runProviderProbe(["--dry-run", "--run"], {}, silentLogger());
    expect(code).toBe(1);
  });
});

describe("runProviderProbe — --dry-run (network 0)", () => {
  it("config validation만 수행하고 generateStructured를 호출하지 않는다", async () => {
    const fake = makeFakeProvider({ kind: "ok" });
    const overrideFn = vi.fn(() => fake.provider);
    const code = await runProviderProbe(
      ["--dry-run"],
      { createConfigured: overrideFn },
      silentLogger(),
    );
    expect(code).toBe(0);
    expect(overrideFn).toHaveBeenCalledTimes(1);
    expect(overrideFn).toHaveBeenCalledWith(); // override 없이 호출
    expect(fake.generateCalls()).toBe(0); // network/LLM 0
  });
});

describe("runProviderProbe — --run", () => {
  it("성공 시 exit 0, 정확히 1회 generateStructured 호출, maxRetries=0 override 전달", async () => {
    const fake = makeFakeProvider({ kind: "ok" });
    const overrideFn = vi.fn(() => fake.provider);
    const code = await runProviderProbe(
      ["--run"],
      { createConfigured: overrideFn },
      silentLogger(),
    );
    expect(code).toBe(0);
    expect(overrideFn).toHaveBeenCalledTimes(1);
    expect(overrideFn).toHaveBeenCalledWith({ maxRetries: 0 });
    expect(fake.generateCalls()).toBe(1); // 정확히 1 HTTP attempt
  });

  it("실패 시 exit 1, safe fields(status/retryAfterMs)만 출력", async () => {
    const fake = makeFakeProvider({ kind: "rate_limited", retryAfterMs: 7000, status: 429 });
    const logger = silentLogger();
    const code = await runProviderProbe(
      ["--run"],
      { createConfigured: () => fake.provider },
      logger,
    );
    expect(code).toBe(1);
    const errorMsg = (logger.error as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as string)
      .join("\n");
    expect(errorMsg).toContain("rate_limited");
    expect(errorMsg).toContain("429");
    expect(errorMsg).toContain("retryAfterMs=7000");
    // key/raw/prompt 원문 미노출
    expect(errorMsg).not.toContain("Authorization");
    expect(errorMsg).not.toContain("api_key");
  });

  it("detail이 존재하면 FAIL 출력에 bounded 형태로 표시한다", async () => {
    const fake = makeFakeProvider({
      kind: "rate_limited",
      status: 400,
      detail: "invalid_request_error | unsupported_param",
    });
    const logger = silentLogger();
    const code = await runProviderProbe(
      ["--run"],
      { createConfigured: () => fake.provider },
      logger,
    );
    expect(code).toBe(1);
    const errorMsg = (logger.error as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as string)
      .join("\n");
    expect(errorMsg).toContain("detail=invalid_request_error | unsupported_param");
  });
});
