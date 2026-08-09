import { describe, expect, it } from "vitest";
import { parseLeaseListParams, type LeaseSearchParams } from "@/lib/lease/query";

describe("parseLeaseListParams", () => {
  it("빈 searchParams면 기본값(1페이지, 필터 없음)을 반환한다", () => {
    expect(parseLeaseListParams({})).toEqual({ page: 1 });
  });

  it("유효한 type을 파싱한다", () => {
    expect(parseLeaseListParams({ type: "HIRE" }).type).toBe("HIRE");
    expect(parseLeaseListParams({ type: "SEEK" }).type).toBe("SEEK");
  });

  it("잘못된 type은 무시한다", () => {
    expect(parseLeaseListParams({ type: "BAD" }).type).toBeUndefined();
  });

  it("지역/차종/톤수는 trim 후 파싱한다", () => {
    const result = parseLeaseListParams({
      regionId: "  region-1 ",
      vehicleTypeId: "vehicle-1",
      tonnageId: "ton-1",
    });
    expect(result.regionId).toBe("region-1");
    expect(result.vehicleTypeId).toBe("vehicle-1");
    expect(result.tonnageId).toBe("ton-1");
  });

  it("빈 문자열 필터는 undefined로 취급한다", () => {
    expect(parseLeaseListParams({ regionId: "  " }).regionId).toBeUndefined();
  });

  it("유효한 payType을 파싱하고 잘못된 값은 무시한다", () => {
    expect(parseLeaseListParams({ payType: "MONTHLY" }).payType).toBe("MONTHLY");
    expect(parseLeaseListParams({ payType: "FREIGHT" }).payType).toBe("FREIGHT");
    expect(parseLeaseListParams({ payType: "NOPE" }).payType).toBeUndefined();
  });

  it("keyword는 trim 후 파싱한다", () => {
    expect(parseLeaseListParams({ keyword: "  지입  " }).keyword).toBe("지입");
    expect(parseLeaseListParams({ keyword: "" }).keyword).toBeUndefined();
  });

  it("page는 1 이상 정수로 정규화한다", () => {
    expect(parseLeaseListParams({ page: "3" }).page).toBe(3);
    expect(parseLeaseListParams({ page: "0" }).page).toBe(1);
    expect(parseLeaseListParams({ page: "-1" }).page).toBe(1);
    expect(parseLeaseListParams({ page: "abc" }).page).toBe(1);
    expect(parseLeaseListParams({ page: "1.5" }).page).toBe(1);
    expect(parseLeaseListParams({}).page).toBe(1);
  });

  it("배열 searchParams는 안전하게 무시한다", () => {
    const searchParams: LeaseSearchParams = { type: ["HIRE", "SEEK"], page: ["2"] };
    const result = parseLeaseListParams(searchParams);
    expect(result.type).toBeUndefined();
    expect(result.page).toBe(1);
  });
});
