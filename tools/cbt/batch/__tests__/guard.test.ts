import { describe, expect, it } from "vitest";
import { resolveBatchScope } from "../guard";

describe("resolveBatchScope", () => {
  it("limit과 all 둘 다 없음 → throw", () => {
    expect(() => resolveBatchScope({ limit: null, all: false }, 10)).toThrow(
      "전체 실행 금지",
    );
  });

  it("limit과 all 동시 지정 → throw", () => {
    expect(() => resolveBatchScope({ limit: 5, all: true }, 10)).toThrow(
      "동시에 지정",
    );
  });

  it("limit > total → total", () => {
    expect(resolveBatchScope({ limit: 20, all: false }, 10)).toBe(10);
  });

  it("limit < total → limit", () => {
    expect(resolveBatchScope({ limit: 3, all: false }, 10)).toBe(3);
  });

  it("all → total", () => {
    expect(resolveBatchScope({ limit: null, all: true }, 10)).toBe(10);
  });
});
