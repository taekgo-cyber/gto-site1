import { getWeeklyMatchQuota, type RecruitmentTier, WEEKLY_QUOTA_TIME_ZONE } from "@/lib/monetization/policy";
import type { ActiveCompanyEntitlement } from "@/lib/monetization/types";

export { WEEKLY_QUOTA_TIME_ZONE };

const TIER_RANK: Record<RecruitmentTier, number> = {
  NONE: 0,
  GENERAL: 1,
  PREMIUM: 2,
  MAIN: 3,
};

function seoulParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEKLY_QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function seoulMidnightUtc(year: number, month: number, day: number): Date {
  // Asia/Seoul has a fixed UTC+09:00 offset for this policy window.
  return new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000);
}

export type WeeklyQuotaWindow = {
  start: Date;
  end: Date;
};

export function getWeeklyQuotaWindow(at: Date): WeeklyQuotaWindow {
  const local = seoulParts(at);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  const start = seoulMidnightUtc(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate());
  return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

export function isEntitlementActive(entitlement: ActiveCompanyEntitlement, at: Date): boolean {
  return entitlement.validFrom.getTime() <= at.getTime() &&
    (entitlement.expiresAt === null || entitlement.expiresAt.getTime() > at.getTime());
}

export function selectHighestActiveTier(
  entitlements: ActiveCompanyEntitlement[],
  at: Date,
): RecruitmentTier {
  return entitlements
    .filter((entitlement) => isEntitlementActive(entitlement, at))
    .reduce<RecruitmentTier>((highest, entitlement) => {
      return TIER_RANK[entitlement.recruitmentTier] > TIER_RANK[highest]
        ? entitlement.recruitmentTier
        : highest;
    }, "NONE");
}

export function getRemainingWeeklyMatchQuota(tier: RecruitmentTier, consumedCount: number): number {
  if (!Number.isInteger(consumedCount) || consumedCount < 0) {
    throw new Error("consumedCount must be a non-negative integer");
  }
  return Math.max(0, getWeeklyMatchQuota(tier) - consumedCount);
}

export function canConsumeWeeklyMatchQuota(tier: RecruitmentTier, consumedCount: number, amount = 1): boolean {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");
  return getRemainingWeeklyMatchQuota(tier, consumedCount) >= amount;
}
