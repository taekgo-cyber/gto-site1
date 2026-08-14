import { describe, expect, it } from "vitest";
import { parseAnswerText } from "./answer-normalize";

describe("parseAnswerText — 허용 표기", () => {
  it("1. '정답: ③' → [3]", () => {
    expect(parseAnswerText("정답: ③")).toEqual({
      answers: [3],
      status: "parsed",
      reason: null,
    });
  });

  it("2. '정답: ③번' → [3]", () => {
    expect(parseAnswerText("정답: ③번")).toMatchObject({ answers: [3] });
  });

  it("3. '답: 3' → [3]", () => {
    expect(parseAnswerText("답: 3")).toMatchObject({ answers: [3] });
  });

  it("4. '정답: 1, 3' → [1,3]", () => {
    expect(parseAnswerText("정답: 1, 3")).toMatchObject({ answers: [1, 3] });
  });

  it("5. '정답: ①, ③' → [1,3]", () => {
    expect(parseAnswerText("정답: ①, ③")).toMatchObject({ answers: [1, 3] });
  });

  it("6. 공백이 섞인 정답 '정답 : ① , ③' → [1,3]", () => {
    expect(parseAnswerText("정답 : ① , ③")).toMatchObject({ answers: [1, 3] });
  });

  it("라벨 없는 '③' / '3번'도 파싱한다", () => {
    expect(parseAnswerText("③")).toMatchObject({ answers: [3] });
    expect(parseAnswerText("3번")).toMatchObject({ answers: [3] });
  });

  it("복수 정답은 순서를 보존한다", () => {
    expect(parseAnswerText("정답: ③, ①")).toMatchObject({ answers: [3, 1] });
  });

  it("중복 번호는 제거한다", () => {
    expect(parseAnswerText("정답: 1, 1")).toMatchObject({ answers: [1] });
  });
});

describe("parseAnswerText — missing / unparseable", () => {
  it("7. null answer → missing, 파싱 안 함", () => {
    const result = parseAnswerText(null);
    expect(result).toEqual({
      answers: [],
      status: "missing",
      reason: "answer_missing",
    });
  });

  it("빈 문자열/공백만 → missing", () => {
    expect(parseAnswerText("")).toMatchObject({ status: "missing" });
    expect(parseAnswerText("   ")).toMatchObject({ status: "missing" });
  });

  it("8. 애매한 answer '③ 또는 ④' → 파싱하지 않는다", () => {
    const result = parseAnswerText("③ 또는 ④");
    expect(result.answers).toEqual([]);
    expect(result.status).toBe("unparseable");
  });

  it("9. 잘못된 answer '정답 추정: 3' → 파싱하지 않는다 (추론 금지)", () => {
    expect(parseAnswerText("정답 추정: 3")).toMatchObject({ status: "unparseable" });
  });

  it("9. '정답: 12' → 두 자릿수는 해석하지 않는다", () => {
    expect(parseAnswerText("정답: 12")).toMatchObject({
      answers: [],
      status: "unparseable",
    });
  });

  it("9. '정답은 알 수 없음' → 파싱하지 않는다", () => {
    expect(parseAnswerText("정답은 알 수 없음")).toMatchObject({ status: "unparseable" });
  });

  it("9. '위 내용을 참고' → 파싱하지 않는다", () => {
    expect(parseAnswerText("위 내용을 참고")).toMatchObject({ status: "unparseable" });
  });

  it("9. '③~⑤' → 범위 표기는 파싱하지 않는다", () => {
    expect(parseAnswerText("③~⑤")).toMatchObject({ status: "unparseable" });
  });

  it("10. '정답: ⑤' → [5]로 파싱 (범위 검증은 validateAnswer가 담당)", () => {
    expect(parseAnswerText("정답: ⑤")).toMatchObject({ answers: [5] });
  });
});
