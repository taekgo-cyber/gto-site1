// STEP 8 — OpenAI-compatible Chat Completions Provider (실제 API).
// abstraction 뒤에 둔다. API Key가 없으면 Mock Provider로 대체된다 (STEP 8 §24).
// OpenAI-compatible API (deepseek/kimi/openai)에 fetch로 JSON-mode 요청을 보낸다.
// 기본 테스트는 이 Provider의 네트워크 호출에 의존하지 않는다.
import type { StructuredGenerationResult, ZodSchema } from "./types";
import { parseStructuredResponse } from "./types";
import type { LlmProvider } from "./types";

export type OpenAiCompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly provider = "openai-compatible";
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: OpenAiCompatibleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  private buildEndpoint(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  private async requestOnce(
    prompt: string,
  ): Promise<{ ok: true; content: string } | { ok: false; code: "timeout" | "provider_error"; message: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.buildEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\n반드시 JSON 객체로만 응답하라. 코드블록/주석 금지.`,
            },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          code: "provider_error",
          message: `API 응답 ${response.status} ${response.statusText}`,
        };
      }

      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return { ok: false, code: "provider_error", message: "응답에 content가 없습니다." };
      }
      return { ok: true, content };
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      return {
        ok: false,
        code: isTimeout ? "timeout" : "provider_error",
        message:
          err instanceof Error ? err.message : "알 수 없는 provider 오류",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async generateStructured<T>(
    prompt: string,
    schema: ZodSchema<T>,
    options?: { promptVersion?: string },
  ): Promise<StructuredGenerationResult<T>> {
    const meta = {
      provider: this.provider,
      model: this.model,
      promptVersion: options?.promptVersion ?? "unknown",
    };

    let lastFailure:
      | { code: "timeout" | "provider_error"; message: string }
      | null = null;
    const attempts = Math.max(0, this.maxRetries) + 1;

    for (let i = 0; i < attempts; i += 1) {
      const result = await this.requestOnce(prompt);
      if (!result.ok) {
        lastFailure = result;
        continue;
      }
      const parsed = parseStructuredResponse(result.content, schema, meta);
      if (parsed.ok) return parsed;
      return parsed; // schema 검증 실패는 retry하지 않는다 (No Drop, 원본 보존)
    }

    if (!lastFailure) {
      return {
        ok: false,
        error: {
          code: "provider_error",
          message: "알 수 없는 오류",
          rawResponse: null,
          ...meta,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: lastFailure.code,
        message: lastFailure.message,
        rawResponse: null,
        ...meta,
      },
    };
  }
}