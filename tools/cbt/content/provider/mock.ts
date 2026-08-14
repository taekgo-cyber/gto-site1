// STEP 8 — Mock LLM Provider (STEP 8 §9).
// 실제 API Key 없이 Golden Path 전체를 검증한다.
// 시나리오: 1) 정상 생성 2) 잘못된 JSON 3) 빈 응답 4) timeout 5) provider error.
// 모든 실패는 StructuredGenerationResult의 { ok: false }로 반환되어 No Drop으로 보존된다.
import type { StructuredGenerationResult, ZodSchema } from "./types";
import { parseStructuredResponse } from "./types";
import type { LlmProvider } from "./types";
import type { LlmFailureCode } from "../types";

export type MockBehavior =
  | { kind: "normal"; data: unknown }
  | { kind: "malformed_json"; raw?: string }
  | { kind: "empty_response" }
  | { kind: "timeout"; delayMs?: number }
  | { kind: "provider_error"; message?: string };

export type MockScript = MockBehavior[];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 시나리오 스크립트를 순서대로 소비하는 Mock Provider.
 * 스크립트가 소진되면 마지막 behavior를 반복한다.
 */
export class MockLlmProvider implements LlmProvider {
  readonly provider = "mock";
  readonly model = "mock-model";

  private queue: MockBehavior[];
  private last: MockBehavior;
  private callCount = 0;

  constructor(behaviors: MockScript | MockBehavior = { kind: "empty_response" }) {
    this.queue = Array.isArray(behaviors) ? [...behaviors] : [behaviors];
    if (this.queue.length === 0) this.queue.push({ kind: "empty_response" });
    this.last = this.queue[this.queue.length - 1];
  }

  /** 호출 횟수 (순서/개수 검증용) */
  get calls(): number {
    return this.callCount;
  }

  async generateStructured<T>(
    _prompt: string,
    schema: ZodSchema<T>,
    options?: { promptVersion?: string },
  ): Promise<StructuredGenerationResult<T>> {
    this.callCount += 1;
    const behavior = this.queue.shift() ?? this.last;
    const meta = {
      provider: this.provider,
      model: this.model,
      promptVersion: options?.promptVersion ?? "unknown",
    };

    switch (behavior.kind) {
      case "normal": {
        const rawResponse = JSON.stringify(behavior.data);
        return parseStructuredResponse(rawResponse, schema, meta);
      }
      case "malformed_json": {
        const rawResponse = behavior.raw ?? '{ "questionText": broken';
        return {
          ok: false,
          error: {
            code: "malformed_json" satisfies LlmFailureCode,
            message: "Mock: malformed JSON",
            rawResponse,
            ...meta,
          },
        };
      }
      case "empty_response": {
        return {
          ok: false,
          error: {
            code: "empty_response" satisfies LlmFailureCode,
            message: "Mock: empty response",
            rawResponse: "",
            ...meta,
          },
        };
      }
      case "timeout": {
        await sleep(behavior.delayMs ?? 20);
        return {
          ok: false,
          error: {
            code: "timeout" satisfies LlmFailureCode,
            message: `Mock: timeout (${behavior.delayMs ?? 20}ms)`,
            rawResponse: null,
            ...meta,
          },
        };
      }
      case "provider_error": {
        return {
          ok: false,
          error: {
            code: "provider_error" satisfies LlmFailureCode,
            message: behavior.message ?? "Mock: provider error",
            rawResponse: null,
            ...meta,
          },
        };
      }
    }
  }
}
