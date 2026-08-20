// STEP 8 — OpenAI-compatible Chat Completions Provider (실제 API).
// production CLI는 createConfiguredProvider의 fail-closed preflight를 거쳐
// 유효 키가 있을 때만 이 Provider를 사용한다. Mock 대체는 테스트/스크립트 전용.
// OpenAI-compatible API (deepseek/kimi/openai)에 fetch로 JSON-mode 요청을 보낸다.
// 기본 테스트는 이 Provider의 네트워크 호출에 의존하지 않는다.
//
// 재시도는 tools/cbt/pipeline/retry.ts의 withRetry/RetryableError를 재사용한다.
// - transient(재시도 대상): timeout / network(provider_error) / 429(rate_limited) / 5xx(server_error)
// - terminal(재시도 금지, 즉시 반환): 그 외 4xx(http_client_error) / 빈 응답(empty_response) /
//   JSON 파싱 실패(malformed_json) / schema 검증 실패(schema_validation_failed)
// retry 횟수/backoff 기본값은 provider index가 config(CBT_LLM_MAX_RETRIES,
// CBT_RETRY_BASE_DELAY_MS)에서 주입한다. 여기서 자체 retry loop를 만들지 않는다.
import type { StructuredGenerationResult, ZodSchema } from "./types";
import { parseStructuredResponse } from "./types";
import type { LlmProvider } from "./types";
import type { LlmFailureCode } from "../types";
import { RetryableError, withRetry, defaultSleep } from "../../pipeline/retry";

/** terminal 실패의 LLM 코드 */
type TerminalLlmCode = "http_client_error" | "empty_response" | "malformed_json";

/** terminal(재시도 금지) provider 오류. code를 보존해 그대로 실패로 기록한다. */
class ProviderTerminalError extends Error {
  readonly code: TerminalLlmCode;
  readonly status?: number;

  constructor(code: TerminalLlmCode, message: string, status?: number) {
    super(message);
    this.name = "ProviderTerminalError";
    this.code = code;
    this.status = status;
  }
}

/**
 * transient provider 오류: retry.ts의 RetryableError를 상속해 withRetry 대상이 된다.
 * code/status를 보존해 재시도 소진 후에도 분류 정보를 그대로 기록한다.
 */
class LlmTransientError extends RetryableError {
  readonly code: LlmFailureCode;
  readonly status?: number;

  constructor(code: LlmFailureCode, message: string, status?: number) {
    super(message);
    this.name = "LlmTransientError";
    this.code = code;
    this.status = status;
  }
}

/**
 * HTTP 상태 코드로 실패 원인을 분류한다 (Provider Guard).
 * - 429 → rate_limited (transient, 재시도)
 * - 5xx → server_error (transient, 재시도)
 * - 그 외 4xx → http_client_error (terminal, 재시도 금지)
 */
export function classifyHttpStatus(status: number): LlmFailureCode {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "http_client_error";
}

export type OpenAiCompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** 재시도 횟수. provider index가 CBT_LLM_MAX_RETRIES를 주입한다 (기본 3) */
  maxRetries?: number;
  /** 지수 backoff 기본 간격(ms). provider index가 CBT_RETRY_BASE_DELAY_MS를 주입한다 (기본 1000) */
  backoffBaseMs?: number;
  /** 재시도 대기용 sleep 주입 (테스트 전용. production에서는 주입하지 않는다) */
  sleep?: (ms: number) => Promise<void>;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly provider = "openai-compatible";
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: OpenAiCompatibleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffBaseMs = config.backoffBaseMs ?? 1000;
    this.sleep = config.sleep ?? defaultSleep;
  }

  private buildEndpoint(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  /** 1회 요청. 성공 시 content 문자열, transient는 LlmTransientError, terminal은 ProviderTerminalError throw */
  private async requestOnce(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.buildEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "User-Agent": "opencode/1.18.16",
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
        const code = classifyHttpStatus(response.status);
        if (code === "http_client_error") {
          throw new ProviderTerminalError(
            "http_client_error",
            `API 응답 ${response.status} ${response.statusText}`,
            response.status,
          );
        }
        throw new LlmTransientError(
          code,
          `API 응답 ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      let body: {
        choices?: { message?: { content?: string } }[];
      };
      try {
        body = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
      } catch {
        throw new ProviderTerminalError(
          "malformed_json",
          "응답 JSON 파싱 실패",
        );
      }
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new ProviderTerminalError(
          "empty_response",
          "LLM이 빈 응답을 반환했습니다.",
        );
      }
      return content;
    } catch (err) {
      if (
        err instanceof LlmTransientError ||
        err instanceof ProviderTerminalError
      ) {
        throw err;
      }
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      throw new LlmTransientError(
        isTimeout ? "timeout" : "provider_error",
        err instanceof Error ? err.message : "알 수 없는 provider 오류",
      );
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

    try {
      const content = await withRetry(
        () => this.requestOnce(prompt),
        {
          maxRetries: this.maxRetries,
          baseDelayMs: this.backoffBaseMs,
          sleep: this.sleep,
        },
      );
      // schema 검증 실패는 retry하지 않는다 (No Drop, 원본 보존)
      return parseStructuredResponse(content, schema, meta);
    } catch (err) {
      if (err instanceof LlmTransientError) {
        return {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            status: err.status,
            rawResponse: null,
            ...meta,
          },
        };
      }
      if (err instanceof ProviderTerminalError) {
        return {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            status: err.status,
            rawResponse: null,
            ...meta,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "provider_error",
          message: err instanceof Error ? err.message : "알 수 없는 오류",
          rawResponse: null,
          ...meta,
        },
      };
    }
  }
}