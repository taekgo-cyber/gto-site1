import { describe, expect, it } from "vitest";
import {
  isValidCbtOptions,
  MAX_OPTIONS,
  MIN_OPTIONS,
  parseCbtOptions,
} from "@/lib/cbt/options";

describe("parseCbtOptions", () => {
  it("정상 JSON 배열을 CbtOption[]로 변환한다", () => {
    const options = parseCbtOptions([
      { id: 1, text: "보기 1" },
      { id: 2, text: "보기 2" },
      { id: 3, text: "보기 3" },
      { id: 4, text: "보기 4" },
    ]);
    expect(options).toEqual([
      { id: 1, text: "보기 1" },
      { id: 2, text: "보기 2" },
      { id: 3, text: "보기 3" },
      { id: 4, text: "보기 4" },
    ]);
  });

  it("text 앞뒤 공백을 제거한다", () => {
    const options = parseCbtOptions([{ id: 1, text: "  보기 1  " }]);
    expect(options[0].text).toBe("보기 1");
  });

  it("배열이 아니면 빈 배열을 반환한다", () => {
    expect(parseCbtOptions(null)).toEqual([]);
    expect(parseCbtOptions("not-array")).toEqual([]);
    expect(parseCbtOptions(42)).toEqual([]);
    expect(parseCbtOptions({})).toEqual([]);
    expect(parseCbtOptions(undefined)).toEqual([]);
  });

  it("null 항목이 있으면 빈 배열을 반환한다", () => {
    expect(parseCbtOptions([{ id: 1, text: "a" }, null])).toEqual([]);
  });

  it("id가 정수가 아니면 빈 배열을 반환한다", () => {
    expect(parseCbtOptions([{ id: "1", text: "a" }])).toEqual([]);
    expect(parseCbtOptions([{ id: 1.5, text: "a" }])).toEqual([]);
    expect(parseCbtOptions([{ id: null, text: "a" }])).toEqual([]);
    expect(parseCbtOptions([{ text: "a" }])).toEqual([]);
  });

  it("text가 비어있거나 문자열이 아니면 빈 배열을 반환한다", () => {
    expect(parseCbtOptions([{ id: 1, text: "" }])).toEqual([]);
    expect(parseCbtOptions([{ id: 1, text: "   " }])).toEqual([]);
    expect(parseCbtOptions([{ id: 1, text: 123 }])).toEqual([]);
    expect(parseCbtOptions([{ id: 1 }])).toEqual([]);
  });

  it("중복 id가 있으면 빈 배열을 반환한다", () => {
    expect(
      parseCbtOptions([
        { id: 1, text: "a" },
        { id: 1, text: "b" },
      ]),
    ).toEqual([]);
  });

  it("빈 배열은 빈 배열을 반환한다", () => {
    expect(parseCbtOptions([])).toEqual([]);
  });
});

describe("isValidCbtOptions", () => {
  it(`옵션 ${MIN_OPTIONS}~${MAX_OPTIONS}개면 유효하다`, () => {
    const make = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: i + 1, text: `보기 ${i + 1}` }));
    expect(isValidCbtOptions(make(MIN_OPTIONS))).toBe(true);
    expect(isValidCbtOptions(make(MAX_OPTIONS))).toBe(true);
  });

  it(`${MIN_OPTIONS}개 미만이면 유효하지 않다`, () => {
    expect(isValidCbtOptions([{ id: 1, text: "보기 1" }])).toBe(false);
    expect(isValidCbtOptions([])).toBe(false);
  });

  it(`${MAX_OPTIONS}개를 초과하면 유효하지 않다`, () => {
    const options = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => ({
      id: i + 1,
      text: `보기 ${i + 1}`,
    }));
    expect(isValidCbtOptions(options)).toBe(false);
  });

  it("shape이 잘못되면 유효하지 않다", () => {
    expect(isValidCbtOptions([{ id: "1", text: "a" }])).toBe(false);
    expect(isValidCbtOptions("not-array")).toBe(false);
  });
});
