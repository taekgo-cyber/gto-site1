import {
  parseLeaseListParams,
  type LeaseSearchParams,
} from "@/lib/lease/query";

/**
 * /lease 목록 페이지에서 검색/필터 파라미터가 적용된 경우 noindex 여부를 판정한다.
 * 기존 parseLeaseListParams와 동일한 파싱 규칙을 재사용하므로,
 * 잘못되거나 빈 필터 값은 무시되고 정규화된 결과만 사용된다.
 */
export function shouldNoindexLeaseList(searchParams: LeaseSearchParams): boolean {
  const query = parseLeaseListParams(searchParams);
  return (
    query.type !== undefined ||
    query.regionId !== undefined ||
    query.vehicleTypeId !== undefined ||
    query.tonnageId !== undefined ||
    query.payType !== undefined ||
    query.keyword !== undefined ||
    query.page > 1
  );
}
