// production CLI preflight (fail-closed) 테스트.
// CBT_LLM_API_KEY/baseUrl/model가 유효하지 않으면 DB/LLM 쓰기 전에 throw해야 한다.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertValidProviderConfig,
  createConfiguredProvider,
  createDefaultProvider,
  createOpenAiProvider,
} from "../provider";

const ENV_KEYS = [
  "CBT_LLM_API_KEY",
  "CBT_LLM_BASE_URL",
  "CBT_LLM_MODEL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("createConfiguredProvider (fail-closed)", () => {
  it("유효한 API key/baseUrl/model → openai-compatible provider", () => {
    process.env.CBT_LLM_API_KEY = "test-key";
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "deepseek-chat";
    const provider = createConfiguredProvider();
    expect(provider.provider).toBe("openai-compatible");
    expect(provider.model).toBe("deepseek-chat");
  });

  it("API key 부재 → throw (mock으로 조용히 대체하지 않는다)", () => {
    delete process.env.CBT_LLM_API_KEY;
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "deepseek-chat";
    expect(() => createConfiguredProvider()).toThrow("CBT_LLM_API_KEY");
  });

  it("baseUrl이 HTTP(S) URL이 아니면 throw", () => {
    process.env.CBT_LLM_API_KEY = "test-key";
    process.env.CBT_LLM_BASE_URL = "not-a-url";
    process.env.CBT_LLM_MODEL = "deepseek-chat";
    expect(() => createConfiguredProvider()).toThrow("CBT_LLM_BASE_URL");
  });

  it("model이 비어있으면 throw", () => {
    process.env.CBT_LLM_API_KEY = "test-key";
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "";
    expect(() => createConfiguredProvider()).toThrow("CBT_LLM_MODEL");
  });
});

describe("assertValidProviderConfig", () => {
  it("유효 설정은 통과시킨다", () => {
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "m";
    expect(() => assertValidProviderConfig()).not.toThrow();
  });

  it("빈 baseUrl → throw", () => {
    process.env.CBT_LLM_BASE_URL = "  ";
    process.env.CBT_LLM_MODEL = "m";
    expect(() => assertValidProviderConfig()).toThrow();
  });
});

describe("createOpenAiProvider / createDefaultProvider", () => {
  it("createOpenAiProvider는 config 값을 반영한다", () => {
    process.env.CBT_LLM_API_KEY = "k";
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "model-x";
    const provider = createOpenAiProvider();
    expect(provider.model).toBe("model-x");
    expect(provider.provider).toBe("openai-compatible");
  });

  it("createDefaultProvider는 key 부재 시 mock으로 fallback (테스트/스크립트 전용)", () => {
    delete process.env.CBT_LLM_API_KEY;
    const provider = createDefaultProvider();
    expect(provider.provider).toBe("mock");
  });

  it("createOpenAiProvider({ maxRetries: 0 }) override를 반영해 생성한다", () => {
    process.env.CBT_LLM_API_KEY = "k";
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "model-x";
    const provider = createOpenAiProvider({ maxRetries: 0 });
    expect(provider.provider).toBe("openai-compatible");
    expect(provider.model).toBe("model-x");
  });

  it("createOpenAiProvider({ now }) override를 반영해 생성한다", () => {
    process.env.CBT_LLM_API_KEY = "k";
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "model-x";
    const provider = createOpenAiProvider({ now: () => new Date("2026-01-01T00:00:00Z") });
    expect(provider.provider).toBe("openai-compatible");
  });

  it("createConfiguredProvider({ maxRetries: 0 }) override로 생성한다", () => {
    process.env.CBT_LLM_API_KEY = "k";
    process.env.CBT_LLM_BASE_URL = "https://api.example.test/v1";
    process.env.CBT_LLM_MODEL = "model-x";
    const provider = createConfiguredProvider({ maxRetries: 0 });
    expect(provider.provider).toBe("openai-compatible");
    expect(provider.model).toBe("model-x");
  });
});