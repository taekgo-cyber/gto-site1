import { describe, expect, it } from "vitest";
import { shouldNoindexLeaseList } from "@/lib/seo/noindex";

describe("shouldNoindexLeaseList", () => {
  it("필터가 없는 기본 목록은 index 대상이다", () => {
    expect(shouldNoindexLeaseList({})).toBe(false);
  });

  it("지역/차종/톤수/payType/keyword/type 필터가 있으면 noindex 대상이다", () => {
    expect(shouldNoindexLeaseList({ regionId: "region-1" })).toBe(true);
    expect(shouldNoindexLeaseList({ vehicleTypeId: "vehicle-1" })).toBe(true);
    expect(shouldNoindexLeaseList({ tonnageId: "ton-1" })).toBe(true);
    expect(shouldNoindexLeaseList({ payType: "MONTHLY" })).toBe(true);
    expect(shouldNoindexLeaseList({ keyword: "지입" })).toBe(true);
    expect(shouldNoindexLeaseList({ type: "HIRE" })).toBe(true);
  });

  it("1페이지는 index 대상, 2페이지부터는 noindex 대상이다", () => {
    expect(shouldNoindexLeaseList({ page: "1" })).toBe(false);
    expect(shouldNoindexLeaseList({ page: "2" })).toBe(true);
    expect(shouldNoindexLeaseList({ page: "3" })).toBe(true);
  });

  it("잘못된 page 값은 기본 1페이지로 취급해 index 대상이다", () => {
    expect(shouldNoindexLeaseList({ page: "0" })).toBe(false);
    expect(shouldNoindexLeaseList({ page: "-1" })).toBe(false);
    expect(shouldNoindexLeaseList({ page: "abc" })).toBe(false);
  });

  it("빈 문자열 필터는 무시한다", () => {
    expect(shouldNoindexLeaseList({ regionId: " " })).toBe(false);
  });

  it("배열 searchParams는 안전하게 무시한다", () => {
    const searchParams = { regionId: ["region-1"], type: ["HIRE", "SEEK"] };
    expect(shouldNoindexLeaseList(searchParams)).toBe(false);
  });
});
