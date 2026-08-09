import type { PayType, LeasePostType } from "@/generated/prisma/enums";

const ALLOWED_TYPES = new Set(["HIRE", "SEEK"]);
const ALLOWED_PAY_TYPES = new Set(["MONTHLY", "DAILY", "FREIGHT", "NEGOTIABLE"]);

export type LeaseSearchParams = {
  [key: string]: string | string[] | undefined;
};

export type LeaseListParams = {
  type?: LeasePostType;
  regionId?: string;
  vehicleTypeId?: string;
  tonnageId?: string;
  payType?: PayType;
  keyword?: string;
  page: number;
};

function getParam(searchParams: LeaseSearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * 목록 페이지 searchParams를 안전하게 파싱한다.
 * 잘못된 필터 값은 무시하고, 페이지 번호는 1 이상의 정수로 정규화한다.
 * (최종 필터 검증은 Session 5 목록 API/DAL에서 수행된다.)
 */
export function parseLeaseListParams(searchParams: LeaseSearchParams): LeaseListParams {
  const typeParam = getParam(searchParams, "type");
  const type =
    typeParam !== undefined && ALLOWED_TYPES.has(typeParam)
      ? (typeParam as LeasePostType)
      : undefined;

  const regionId = getParam(searchParams, "regionId")?.trim() || undefined;
  const vehicleTypeId = getParam(searchParams, "vehicleTypeId")?.trim() || undefined;
  const tonnageId = getParam(searchParams, "tonnageId")?.trim() || undefined;

  const payTypeParam = getParam(searchParams, "payType");
  const payType =
    payTypeParam !== undefined && ALLOWED_PAY_TYPES.has(payTypeParam)
      ? (payTypeParam as PayType)
      : undefined;

  const keyword = getParam(searchParams, "keyword")?.trim() || undefined;

  const rawPage = Number(getParam(searchParams, "page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  return { type, regionId, vehicleTypeId, tonnageId, payType, keyword, page };
}
