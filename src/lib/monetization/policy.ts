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
