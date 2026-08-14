// STEP 8 — LLM Provider abstraction (STEP 8 §8).
// Spec 인터페이스: generateStructured<T>(prompt, schema) → StructuredGenerationResult<T>
// 모든 실패는 StructuredGenerationResult의 { ok: false }로 반환한다. throw해서 데이터가
// 사라지는 구조를 만들지 않는다 (No Drop 원칙, STEP 8 §16).
import type { ZodType } from "zod";
import type { LlmFailure } from "../types";

/** Spec의 ZodSchema<T>. zod v4에는 ZodSchema export가 없어 별칭으로 제공한다 */
export type ZodSchema<T> = ZodType<T>;

export type StructuredGenerationResult<T> =
  | { ok: true; data: T; rawResponse: string }
  | { ok: false; error: LlmFailure };

export interface LlmProvider {
  readonly provider: string;
  readonly model: string;
  generateStructured<T>(
    prompt: string,
    schema: ZodSchema<T>,
    options?: { promptVersion?: string },
  ): Promise<StructuredGenerationResult<T>>;
}

/** ```json ... ``` 또는 ``` ... ``` Markdown 코드블록을 벗겨낸다 */
function stripMarkdownCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^\s*```(?:json)?\s*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

/** 첫 { ... } 로 묶인 JSON 객체를 추출한다. 유효하지 않으면 null */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * LLM 응답 → JSON 텍스트 정규화.
 * - Markdown 코드블록(```json/```) 제거
 * - 앞뒤에 prose("여기 JSON입니다: {...}")가 붙은 경우 객체만 추출
 * 정규화에도 실패하면 null (원본은 보존된다)
 */
export function normalizeJsonText(raw: string): string | null {
  const stripped = stripMarkdownCodeFence(raw);
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    return extractJsonObject(raw);
  }
}

/** 공용: raw 문자열 → JSON 파싱 + zod 검증 (실제/목 Provider 양쪽에서 공유) */
export function parseStructuredResponse<T>(
  rawResponse: string,
  schema: ZodSchema<T>,
  meta: {
    provider: string;
    model: string;
    promptVersion: string;
  },
): StructuredGenerationResult<T> {
  const trimmed = rawResponse.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: {
        code: "empty_response",
        message: "LLM이 빈 응답을 반환했습니다.",
        rawResponse,
        ...meta,
      },
    };
  }

  const jsonText = normalizeJsonText(trimmed);
  if (jsonText === null) {
    return {
      ok: false,
      error: {
        code: "malformed_json",
        message: "LLM 응답이 유효한 JSON이 아닙니다.",
        rawResponse,
        ...meta,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: {
        code: "malformed_json",
        message: "LLM 응답이 유효한 JSON이 아닙니다.",
        rawResponse,
        ...meta,
      },
    };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const detail = validated.error.issues
      .slice(0, 5)
      .map((issue) => issue.message)
      .join("; ");
    return {
      ok: false,
      error: {
        code: "schema_validation_failed",
        message: `스키마 검증 실패: ${detail}`,
        rawResponse,
        ...meta,
      },
    };
  }

  return { ok: true, data: validated.data as T, rawResponse };
}