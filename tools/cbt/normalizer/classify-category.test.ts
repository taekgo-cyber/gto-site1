import { describe, expect, it } from "vitest";
import {
  classifyByKeyword,
  classifyCategory,
  resolveSourceCategory,
} from "./classify-category";

describe("resolveSourceCategory — 소스 설정 기반", () => {
  it("25. LAW → CAT-LAW", () => {
    expect(resolveSourceCategory("LAW")).toBe("CAT-LAW");
  });

  it("26. HANDLING → CAT-HANDLING", () => {
    expect(resolveSourceCategory("HANDLING")).toBe("CAT-HANDLING");
  });

  it("27. SAFETY → CAT-SAFETY", () => {
    expect(resolveSourceCategory("SAFETY")).toBe("CAT-SAFETY");
  });

  it("28. SERVICE → CAT-SERVICE", () => {
    expect(resolveSourceCategory("SERVICE")).toBe("CAT-SERVICE");
  });

  it("29. EXTRA → UNKNOWN (아직 미분류)", () => {
    expect(resolveSourceCategory("EXTRA")).toBe("UNKNOWN");
  });

  it("미지의 소스 → null", () => {
    expect(resolveSourceCategory("NOPE")).toBeNull();
  });
});

describe("classifyCategory", () => {
  it("source category가 확정되면 그 값을 사용한다", () => {
    const result = classifyCategory({
      sourceCategory: "CAT-LAW",
      text: "아무 텍스트",
    });
    expect(result).toEqual({ category: "CAT-LAW", method: "source" });
  });

  it("source category가 UNKNOWN이면 rule로 분류 시도", () => {
    const result = classifyCategory({
      sourceCategory: "UNKNOWN",
      text: "화물의 적재 중량 기준은 무엇인가?",
    });
    expect(result.category).toBe("CAT-HANDLING");
    expect(result.method).toBe("rule");
  });

  it("30. rule로도 분류 불가 → UNKNOWN (method unknown)", () => {
    const result = classifyCategory({
      sourceCategory: "UNKNOWN",
      text: "이 문제에는 분류 키워드가 전혀 없다",
    });
    expect(result.category).toBe("UNKNOWN");
    expect(result.method).toBe("unknown");
  });

  it("동점이면 분류 보류 → UNKNOWN", () => {
    const result = classifyCategory({
      sourceCategory: "UNKNOWN",
      text: "법 안전",
    });
    expect(result.category).toBe("UNKNOWN");
  });

  it("classifyByKeyword: 빈 텍스트 → null", () => {
    expect(classifyByKeyword("   ")).toBeNull();
  });

  it("classifyByKeyword: 안전 운전 관련 → CAT-SAFETY", () => {
    expect(classifyByKeyword("졸음 운전은 안전사고 위험이 크다")).toBe("CAT-SAFETY");
  });

  it("허용 카테고리 외 값이 나오지 않는다", () => {
    const result = classifyCategory({
      sourceCategory: "UNKNOWN",
      text: "화물 운송 서비스 고객 응대 요령",
    });
    expect(["CAT-LAW", "CAT-HANDLING", "CAT-SAFETY", "CAT-SERVICE", "UNKNOWN"]).toContain(
      result.category,
    );
  });
});
