import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLlmProvider, type MockBehavior } from "../provider/mock";
import { parseStructuredResponse } from "../provider/types";

const TEST_SCHEMA = z.object({
  value: z.number(),
  label: z.string(),
});

describe("MockLlmProvider 시나리오 (STEP 8 §9)", () => {
  it("1) 정상 생성 → ok:true, zod 검증 통과", async () => {
    const provider = new MockLlmProvider({ kind: "normal", data: { value: 1, label: "a" } });
    const result = await provider.generateStructured("p", TEST_SCHEMA, { promptVersion: "v1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ value: 1, label: "a" });
      expect(result.rawResponse).toBe(JSON.stringify({ value: 1, label: "a" }));
    }
  });

  it("정상이지만 스키마와 다른 데이터 → schema_validation_failed (No Drop, raw 보존)", async () => {
    const provider = new MockLlmProvider({ kind: "normal", data: { value: "not-a-number", label: "a" } });
    const result = await provider.generateStructured("p", TEST_SCHEMA);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema_validation_failed");
      expect(result.error.rawResponse).toBe(
        JSON.stringify({ value: "not-a-number", label: "a" }),
      );
    }
  });

  it("2) 잘못된 JSON → malformed_json", async () => {
    const provider = new MockLlmProvider({ kind: "malformed_json" });
    const result = await provider.generateStructured("p", TEST_SCHEMA);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed_json");
      expect(result.error.rawResponse).toContain("{");
    }
  });

  it("3) 빈 응답 → empty_response", async () => {
    const provider = new MockLlmProvider({ kind: "empty_response" });
    const result = await provider.generateStructured("p", TEST_SCHEMA);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("empty_response");
      expect(result.error.rawResponse).toBe("");
    }
  });

  it("4) timeout → timeout", async () => {
    const provider = new MockLlmProvider({ kind: "timeout", delayMs: 1 });
    const result = await provider.generateStructured("p", TEST_SCHEMA);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("timeout");
  });

  it("5) provider error → provider_error", async () => {
    const provider = new MockLlmProvider({ kind: "provider_error", message: "boom" });
    const result = await provider.generateStructured("p", TEST_SCHEMA);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("provider_error");
      expect(result.error.message).toContain("boom");
    }
  });

  it("스크립트를 순서대로 소비하고, 소진 후 마지막을 반복한다", async () => {
    const script: MockBehavior[] = [
      { kind: "normal", data: { value: 1, label: "first" } },
      { kind: "empty_response" },
    ];
    const provider = new MockLlmProvider(script);
    const r1 = await provider.generateStructured("p", TEST_SCHEMA);
    expect(r1.ok && r1.data.label).toBe("first");
    const r2 = await provider.generateStructured("p", TEST_SCHEMA);
    expect(r2.ok).toBe(false);
    const r3 = await provider.generateStructured("p", TEST_SCHEMA);
    expect(r3.ok).toBe(false); // 마지막(empty) 반복
    expect(provider.calls).toBe(3);
  });
});

describe("parseStructuredResponse 공용 파서", () => {
  it("빈 문자열 → empty_response", () => {
    const r = parseStructuredResponse("  ", TEST_SCHEMA, {
      provider: "p",
      model: "m",
      promptVersion: "v1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("empty_response");
  });

  it("유효하지 않은 JSON → malformed_json", () => {
    const r = parseStructuredResponse('{"value":', TEST_SCHEMA, {
      provider: "p",
      model: "m",
      promptVersion: "v1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("malformed_json");
  });

  it("JSON이지만 스키마 불일치 → schema_validation_failed", () => {
    const r = parseStructuredResponse('{"value": "x"}', TEST_SCHEMA, {
      provider: "p",
      model: "m",
      promptVersion: "v1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("schema_validation_failed");
  });

  it("JSON+스키마 일치 → ok:true", () => {
    const r = parseStructuredResponse('{"value": 3, "label": "l"}', TEST_SCHEMA, {
      provider: "p",
      model: "m",
      promptVersion: "v1",
    });
    expect(r.ok).toBe(true);
  });

  it("Markdown ```json 코드블록으로 감싼 JSON → ok:true", () => {
    const r = parseStructuredResponse(
      '```json\n{"value": 4, "label": "fenced"}\n```',
      TEST_SCHEMA,
      { provider: "p", model: "m", promptVersion: "v1" },
    );
    expect(r.ok).toBe(true);
  });

  it("Markdown ``` 코드블록(언어 미지정)으로 감싼 JSON → ok:true", () => {
    const r = parseStructuredResponse(
      '```\n{"value": 5, "label": "plain-fence"}\n```',
      TEST_SCHEMA,
      { provider: "p", model: "m", promptVersion: "v1" },
    );
    expect(r.ok).toBe(true);
  });

  it("앞뒤에 prose가 붙은 JSON → 객체 추출 → ok:true", () => {
    const r = parseStructuredResponse(
      '여기 생성한 JSON입니다:\n{"value": 6, "label": "prose"}\n감사합니다.',
      TEST_SCHEMA,
      { provider: "p", model: "m", promptVersion: "v1" },
    );
    expect(r.ok).toBe(true);
  });

  it("코드블록 안에 유효하지 않은 JSON → malformed_json", () => {
    const r = parseStructuredResponse(
      '```json\n{"value": broken}\n```',
      TEST_SCHEMA,
      { provider: "p", model: "m", promptVersion: "v1" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("malformed_json");
      expect(r.error.rawResponse).toContain('```json');
    }
  });
});
