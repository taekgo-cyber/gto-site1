/**
 * Product policy. Homepage capacity finalized in the paid-inventory closeout;
 * existing pricing, credits and quotas remain unchanged.
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

export const HOMEPAGE_AD_PLACEMENTS = {
  RECRUITMENT: "HOME_RECRUITMENT",
  COMPANY_LEFT: "HOME_COMPANY_LEFT",
  COMPANY_RIGHT: "HOME_COMPANY_RIGHT",
} as const;

export type HomepageAdPlacementCode =
  (typeof HOMEPAGE_AD_PLACEMENTS)[keyof typeof HOMEPAGE_AD_PLACEMENTS];

export const HOMEPAGE_AD_INVENTORY_CAPACITY = {
  MAIN: 20,
  PREMIUM: 30,
  GENERAL: 40,
  COMPANY_LEFT: 6,
  COMPANY_RIGHT: 6,
} as const;

// Per carousel page (company rails show their full six-slot placement).
export const HOMEPAGE_AD_VISIBLE_SLOTS = {
  MAIN: 10,
  PREMIUM: 15,
  GENERAL: 20,
  COMPANY_LEFT: 6,
  COMPANY_RIGHT: 6,
} as const;

// Client page rotation is independent of server-side candidate selection.
export const HOMEPAGE_AD_PAGE_INTERVAL_MS = 5_000;

export const ADVERTISEMENT_ROTATION_WINDOW_MINUTES = 30;

export const COMPANY_BANNER_PRODUCT = {
  code: "AD_COMPANY_BANNER_30D",
  displayName: "기업 배너 광고 30일",
  advertisementType: "COMPANY_BANNER",
  priceKrw: 300_000,
  durationDays: 30,
  allowedPlacements: [
    HOMEPAGE_AD_PLACEMENTS.COMPANY_LEFT,
    HOMEPAGE_AD_PLACEMENTS.COMPANY_RIGHT,
  ],
} as const;

export type AdvertisementProductType =
  | "RECRUITMENT_LISTING"
  | "COMPANY_BANNER";

export const ADVERTISEMENT_TIER_PRIORITY: Record<PaidRecruitmentTier, number> = {
  GENERAL: 1,
  PREMIUM: 2,
  MAIN: 3,
};

export function compareAdvertisementTiers(
  left: PaidRecruitmentTier,
  right: PaidRecruitmentTier,
): number {
  return ADVERTISEMENT_TIER_PRIORITY[right] - ADVERTISEMENT_TIER_PRIORITY[left];
}

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

export type HomepageAdvertisementProductContract =
  | ((typeof ADVERTISEMENT_PRODUCT_CATALOG)[PaidRecruitmentTier] & {
      advertisementType: "RECRUITMENT_LISTING";
      allowedPlacements: readonly [typeof HOMEPAGE_AD_PLACEMENTS.RECRUITMENT];
    })
  | typeof COMPANY_BANNER_PRODUCT;

export function getHomepageAdvertisementProductContract(
  code: string,
): HomepageAdvertisementProductContract | null {
  if (code === COMPANY_BANNER_PRODUCT.code) return COMPANY_BANNER_PRODUCT;
  const recruitment = getAdvertisementProductPolicy(code);
  return recruitment
    ? {
        ...recruitment,
        advertisementType: "RECRUITMENT_LISTING" as const,
        allowedPlacements: [HOMEPAGE_AD_PLACEMENTS.RECRUITMENT] as const,
      }
    : null;
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
