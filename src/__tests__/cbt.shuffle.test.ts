import { describe, expect, it, vi } from "vitest";
import {
  getDisplayIndexOfOption,
  shuffleArray,
  shuffleQuestionOptions,
} from "@/lib/cbt/shuffle";

describe("shuffleArray", () => {
  it("동일한 원소 집합과 길이를 유지한 순열을 반환한다", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffleArray(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    shuffleArray(input);
    expect(input).toEqual(snapshot);
  });

  it("빈 배열을 안전하게 처리한다", () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it("Math.random 결과를 사용해 순서를 섞는다", () => {
    const input = [1, 2, 3, 4, 5];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    // Fisher-Yates에서 random()=0이면 매 스텝 j=0이 되어 결정적으로 [2,3,4,5,1]이 된다.
    const result = shuffleArray(input);
    expect(result).toEqual([2, 3, 4, 5, 1]);
    random.mockRestore();
  });
});

describe("shuffleQuestionOptions", () => {
  it("보기 순서가 바뀌어도 원본 id와 text 매핑을 보존한다", () => {
    const options = [
      { id: 1, text: "보기 1" },
      { id: 2, text: "보기 2" },
      { id: 3, text: "보기 3" },
      { id: 4, text: "보기 4" },
    ];
    const result = shuffleQuestionOptions(options);
    expect(result).toHaveLength(options.length);
    const mapping = new Map(result.map((option) => [option.id, option.text]));
    for (const option of options) {
      expect(mapping.get(option.id)).toBe(option.text);
    }
    expect(result.map((option) => option.id).sort()).toEqual(
      options.map((option) => option.id).sort(),
    );
  });
});

describe("getDisplayIndexOfOption", () => {
  it("원본 optionId를 화면 표시 번호(1부터)로 역매핑한다", () => {
    const options = [
      { id: 1, text: "A" },
      { id: 2, text: "B" },
      { id: 3, text: "C" },
    ];
    expect(getDisplayIndexOfOption(options, 1)).toBe(1);
    expect(getDisplayIndexOfOption(options, 3)).toBe(3);
  });

  it("셔플된 표시 순서에서 올바른 번호를 반환한다", () => {
    const options = [
      { id: 4, text: "D" },
      { id: 1, text: "A" },
      { id: 3, text: "C" },
      { id: 2, text: "B" },
    ];
    expect(getDisplayIndexOfOption(options, 2)).toBe(4);
    expect(getDisplayIndexOfOption(options, 4)).toBe(1);
  });

  it("존재하지 않는 optionId는 null을 반환한다", () => {
    const options = [{ id: 1, text: "A" }];
    expect(getDisplayIndexOfOption(options, 99)).toBeNull();
  });
});
