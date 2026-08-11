import { describe, expect, it } from "vitest";
import {
  buildRegionSlugMap,
  buildTonnageSlugMap,
  regionSlug,
  tonnageSlug,
} from "@/lib/seo/slugs";

describe("regionSlug", () => {
  it("대문자 코드를 소문자 slug로 변환한다", () => {
    expect(regionSlug({ code: "INCHEON" })).toBe("incheon");
    expect(regionSlug({ code: "GYEONGGI" })).toBe("gyeonggi");
    expect(regionSlug({ code: "SEOUL" })).toBe("seoul");
  });
});

describe("tonnageSlug", () => {
  it("weightKg 기준 사람이 읽을 수 있는 slug를 만든다", () => {
    expect(tonnageSlug({ id: "t1", code: "T1", name: "1톤", weightKg: 1000 })).toBe(
      "1ton",
    );
    expect(
      tonnageSlug({ id: "t1_4", code: "T1_4", name: "1.4톤", weightKg: 1400 }),
    ).toBe("1.4ton");
    expect(
      tonnageSlug({ id: "t2_5", code: "T2_5", name: "2.5톤", weightKg: 2500 }),
    ).toBe("2.5ton");
    expect(tonnageSlug({ id: "t11", code: "T11", name: "11톤", weightKg: 11000 })).toBe(
      "11ton",
    );
    expect(tonnageSlug({ id: "t40", code: "T40", name: "40톤", weightKg: 40000 })).toBe(
      "40ton",
    );
  });

  it("weightKg가 없으면 code 소문자로 fallback한다", () => {
    expect(
      tonnageSlug({ id: "t1", code: "T1", name: "1톤", weightKg: null }),
    ).toBe("t1");
  });

  it("weightKg가 0 이하면 code 소문자로 fallback한다", () => {
    expect(
      tonnageSlug({ id: "t0", code: "T0", name: "기타", weightKg: 0 }),
    ).toBe("t0");
  });
});

describe("buildRegionSlugMap", () => {
  it("slug → region 역매핑을 만든다", () => {
    const map = buildRegionSlugMap([
      { id: "r1", code: "INCHEON", name: "인천" },
      { id: "r2", code: "GYEONGGI", name: "경기" },
    ]);
    expect(map.get("incheon")?.name).toBe("인천");
    expect(map.get("gyeonggi")?.id).toBe("r2");
    expect(map.get("INCHEON")).toBeUndefined();
  });
});

describe("buildTonnageSlugMap", () => {
  it("weightKg 기반 slug → tonnage 역매핑을 만든다", () => {
    const map = buildTonnageSlugMap([
      { id: "t1", code: "T1", name: "1톤", weightKg: 1000 },
    ]);
    expect(map.get("1ton")?.id).toBe("t1");
  });
});
