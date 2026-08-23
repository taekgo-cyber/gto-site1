import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKAGE_CATALOG,
  getWeeklyMatchQuota,
  isCreditPackageCatalogValid,
  OPERATION_CREDIT_COST,
} from "@/lib/monetization/policy";
import {
  canConsumeWeeklyMatchQuota,
  getRemainingWeeklyMatchQuota,
  getWeeklyQuotaWindow,
  selectHighestActiveTier,
} from "@/lib/quotas/policy";

describe("Session 13 Gate 4 Product / Quota Foundation", () => {
  it("keeps CreditPackage catalog separate and preserves 1 KRW = 1 Credit", () => {
    expect(CREDIT_PACKAGE_CATALOG).toEqual([
      { code: "CREDIT_20000", displayName: "20,000 Credit", priceKrw: 20_000, creditAmount: 20_000 },
      { code: "CREDIT_50000", displayName: "50,000 Credit", priceKrw: 50_000, creditAmount: 50_000 },
      { code: "CREDIT_100000", displayName: "100,000 Credit", priceKrw: 100_000, creditAmount: 100_000 },
    ]);
    expect(CREDIT_PACKAGE_CATALOG.every(isCreditPackageCatalogValid)).toBe(true);
    expect(OPERATION_CREDIT_COST).toEqual({ MATCH: 2_000, CONTACT_UNLOCK: 20_000 });
  });

  it("maps highest active recruitment tier without stacking", () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    const entitlements = [
      { companyId: "c1", recruitmentTier: "GENERAL" as const, validFrom: new Date("2026-08-01T00:00:00Z"), expiresAt: null },
      { companyId: "c1", recruitmentTier: "PREMIUM" as const, validFrom: new Date("2026-08-10T00:00:00Z"), expiresAt: null },
      { companyId: "c1", recruitmentTier: "MAIN" as const, validFrom: new Date("2026-08-01T00:00:00Z"), expiresAt: new Date("2026-08-20T00:00:00Z") },
    ];
    expect(selectHighestActiveTier(entitlements, now)).toBe("PREMIUM");
    expect(getWeeklyMatchQuota("NONE")).toBe(1);
    expect(getWeeklyMatchQuota("GENERAL")).toBe(3);
    expect(getWeeklyMatchQuota("PREMIUM")).toBe(5);
    expect(getWeeklyMatchQuota("MAIN")).toBe(10);
  });

  it("uses Asia/Seoul Monday windows with no rollover", () => {
    const before = getWeeklyQuotaWindow(new Date("2026-08-23T14:59:59.999Z"));
    const at = getWeeklyQuotaWindow(new Date("2026-08-23T15:00:00.000Z"));
    expect(before.start.toISOString()).toBe("2026-08-16T15:00:00.000Z");
    expect(at.start.toISOString()).toBe("2026-08-23T15:00:00.000Z");
    expect(before.end).toEqual(at.start);
  });

  it("preserves used count when upgrading from GENERAL to PREMIUM", () => {
    expect(getRemainingWeeklyMatchQuota("GENERAL", 2)).toBe(1);
    expect(getRemainingWeeklyMatchQuota("PREMIUM", 2)).toBe(3);
    expect(canConsumeWeeklyMatchQuota("PREMIUM", 2, 3)).toBe(true);
    expect(canConsumeWeeklyMatchQuota("PREMIUM", 2, 4)).toBe(false);
  });

  it("does not permit negative or over-cap quota counts", () => {
    expect(getRemainingWeeklyMatchQuota("MAIN", 12)).toBe(0);
    expect(() => getRemainingWeeklyMatchQuota("GENERAL", -1)).toThrow();
    expect(() => canConsumeWeeklyMatchQuota("GENERAL", 0, 0)).toThrow();
  });
});
