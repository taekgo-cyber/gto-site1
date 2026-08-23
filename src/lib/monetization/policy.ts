/**
 * Session 13 Gate 4 locked product policy.
 * Catalog/policy only: no purchase, payment, or credit grant side effects.
 */

export const CREDIT_PACKAGE_CATALOG = [
  { code: "CREDIT_20000", displayName: "20,000 Credit", priceKrw: 20_000, creditAmount: 20_000 },
  { code: "CREDIT_50000", displayName: "50,000 Credit", priceKrw: 50_000, creditAmount: 50_000 },
  { code: "CREDIT_100000", displayName: "100,000 Credit", priceKrw: 100_000, creditAmount: 100_000 },
] as const;

export const OPERATION_CREDIT_COST = {
  MATCH: 2_000,
  CONTACT_UNLOCK: 20_000,
} as const;

export const WEEKLY_MATCH_QUOTA = {
  NONE: 1,
  GENERAL: 3,
  PREMIUM: 5,
  MAIN: 10,
} as const;

export type RecruitmentTier = keyof typeof WEEKLY_MATCH_QUOTA;
export type PaidRecruitmentTier = Exclude<RecruitmentTier, "NONE">;

export const ADVERTISEMENT_PRODUCT_CATALOG = {
  GENERAL: {
    code: "AD_GENERAL_7D",
    displayName: "일반 광고 7일",
    recruitmentTier: "GENERAL",
    priceKrw: 40_000,
    durationDays: 7,
    weeklyMatchQuota: WEEKLY_MATCH_QUOTA.GENERAL,
  },
  PREMIUM: {
    code: "AD_PREMIUM_7D",
    displayName: "프리미엄 광고 7일",
    recruitmentTier: "PREMIUM",
    priceKrw: 80_000,
    durationDays: 7,
    weeklyMatchQuota: WEEKLY_MATCH_QUOTA.PREMIUM,
  },
  MAIN: {
    code: "AD_MAIN_7D",
    displayName: "메인 광고 7일",
    recruitmentTier: "MAIN",
    priceKrw: 150_000,
    durationDays: 7,
    weeklyMatchQuota: WEEKLY_MATCH_QUOTA.MAIN,
  },
} as const satisfies Record<PaidRecruitmentTier, {
  code: string;
  displayName: string;
  recruitmentTier: PaidRecruitmentTier;
  priceKrw: number;
  durationDays: number;
  weeklyMatchQuota: number;
}>;

export type ManagedAdvertisementProductCode =
  (typeof ADVERTISEMENT_PRODUCT_CATALOG)[PaidRecruitmentTier]["code"];

const ADVERTISEMENT_PRODUCTS_BY_CODE = Object.values(ADVERTISEMENT_PRODUCT_CATALOG).reduce(
  (acc, product) => {
    acc[product.code] = product;
    return acc;
  },
  {} as Record<ManagedAdvertisementProductCode, (typeof ADVERTISEMENT_PRODUCT_CATALOG)[PaidRecruitmentTier]>,
);

export function getAdvertisementProductPolicy(code: string) {
  return ADVERTISEMENT_PRODUCTS_BY_CODE[code as ManagedAdvertisementProductCode] ?? null;
}

export const WEEKLY_QUOTA_TIME_ZONE = "Asia/Seoul" as const;

export function getWeeklyMatchQuota(tier: RecruitmentTier): number {
  return WEEKLY_MATCH_QUOTA[tier];
}

export function isCreditPackageCatalogValid(input: {
  priceKrw: number;
  creditAmount: number;
}): boolean {
  return Number.isInteger(input.priceKrw) && input.priceKrw > 0 &&
    Number.isInteger(input.creditAmount) && input.creditAmount > 0;
}
