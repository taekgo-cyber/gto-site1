import { describe, expect, it } from "vitest";
import {
  computeSimilarity,
  jaccardSimilarity,
  tokenizeText,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../similarity";

describe("Similarity Checker (STEP 8 §13)", () => {
  it("tokenizeText: 소문자/구분자 처리", () => {
    expect(tokenizeText("적재 시 안전하게! 2.5톤")).toEqual([
      "적재",
      "시",
      "안전하게",
      "2",
      "5톤",
    ]);
  });

  it("동일 텍스트 → 1.0", () => {
    expect(jaccardSimilarity("적재 시 안전", "적재 시 안전")).toBe(1);
  });

  it("완전히 다른 텍스트 → 0.0", () => {
    expect(jaccardSimilarity("apple banana", "dog cat")).toBe(0);
  });

  it("부분 겹침 → (0, 1) 사이", () => {
    const score = jaccardSimilarity("a b c", "a b d");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("빈 입력 → 0", () => {
    expect(jaccardSimilarity("", "a b c")).toBe(0);
  });

  it("computeSimilarity: threshold 이상이면 warning=true (참고용 flag)", () => {
    const high = computeSimilarity(
      "화물을 적재할 때 안전하게 적재한다",
      "화물을 적재할 때 안전하게 적재한다",
    );
    expect(high.score).toBeGreaterThanOrEqual(DEFAULT_SIMILARITY_THRESHOLD);
    expect(high.warning).toBe(true);

    const low = computeSimilarity(
      "공사의 지휘감독과는 무관한 운송 서비스 향상 방안",
      "화물을 적재할 때 안전하게 적재한다",
    );
    expect(low.warning).toBe(false);
  });

  it("유사도 점수는 자동 판정이 아니라 참고용이다 (warning만 제공)", () => {
    // 유사도가 낮다고 "법적 안전"으로 판정하지 않는다 — flag 반환 여부만 검증
    const result = computeSimilarity("독립된 문장 A", "독립된 문장 B");
    expect(typeof result.score).toBe("number");
    expect(typeof result.warning).toBe("boolean");
  });
});
