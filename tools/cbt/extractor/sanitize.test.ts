import { describe, expect, it } from "vitest";
import { sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("HTML entity를 decode한다", () => {
    expect(sanitizeText("A &amp; B &lt; C &gt; D")).toBe("A & B < C > D");
  });

  it("&nbsp;를 공백으로 변환한다", () => {
    expect(sanitizeText("1&nbsp;톤&nbsp;이하")).toBe("1 톤 이하");
  });

  it("<br> 계열을 줄바꿈으로 변환한다", () => {
    expect(sanitizeText("a<br>b")).toBe("a\nb");
    expect(sanitizeText("a<br/>b")).toBe("a\nb");
  });

  it("zero-width character를 제거한다", () => {
    expect(sanitizeText("ab\u200bcd\u200def")).toBe("abcdef");
    expect(sanitizeText("a\u2060b\ufeffc")).toBe("abc");
  });

  it("연속 공백을 하나로 정리하고 앞뒤 공백을 제거한다", () => {
    expect(sanitizeText("  화물  자동차   검사  ")).toBe("화물 자동차 검사");
  });

  it("과도한 빈 줄을 제거한다", () => {
    expect(sanitizeText("  \n  a\n\n\nb  \n")).toBe("a\nb");
  });

  it("보기 구조의 개행을 보존한다", () => {
    expect(sanitizeText("① 1톤 이하\n② 1톤 초과")).toBe("① 1톤 이하\n② 1톤 초과");
  });

  it("빈 입력은 빈 문자열을 반환한다", () => {
    expect(sanitizeText("")).toBe("");
    expect(sanitizeText("   \n  ")).toBe("");
  });
});
