import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADVERTISEMENT_PRODUCT_CATALOG,
  getAdvertisementProductPolicy,
} from "@/lib/monetization/policy";

const productFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: productFindUnique,
    },
  },
}));

import { getManagedAdvertisementProductByCode } from "@/lib/monetization/service";

describe("Session 14 Gate 2 advertisement product foundation", () => {
  beforeEach(() => {
    productFindUnique.mockReset();
  });

  it("locks managed product identity, 7-day price, and weekly quota", () => {
    expect(ADVERTISEMENT_PRODUCT_CATALOG).toEqual({
      GENERAL: {
        code: "AD_GENERAL_7D",
        displayName: "일반 광고 7일",
        recruitmentTier: "GENERAL",
        priceKrw: 40_000,
        durationDays: 7,
        weeklyMatchQuota: 3,
      },
      PREMIUM: {
        code: "AD_PREMIUM_7D",
        displayName: "프리미엄 광고 7일",
        recruitmentTier: "PREMIUM",
        priceKrw: 80_000,
        durationDays: 7,
        weeklyMatchQuota: 5,
      },
      MAIN: {
        code: "AD_MAIN_7D",
        displayName: "메인 광고 7일",
        recruitmentTier: "MAIN",
        priceKrw: 150_000,
        durationDays: 7,
        weeklyMatchQuota: 10,
      },
    });
    expect(getAdvertisementProductPolicy("AD_MAIN_7D")?.recruitmentTier).toBe("MAIN");
    expect(getAdvertisementProductPolicy("display-name-is-not-an-id")).toBeNull();
  });

  it("returns only an active advertisement product matching locked DB policy", async () => {
    productFindUnique.mockResolvedValue({
      id: "product-general",
      code: "AD_GENERAL_7D",
      name: "일반 광고 7일",
      price: 40_000,
      type: "ADVERTISEMENT",
      status: "ACTIVE",
      recruitmentEntitlement: {
        id: "entitlement-general",
        recruitmentTier: "GENERAL",
        weeklyMatchQuota: 3,
      },
    });

    await expect(getManagedAdvertisementProductByCode(" AD_GENERAL_7D ")).resolves.toEqual({
      productId: "product-general",
      code: "AD_GENERAL_7D",
      displayName: "일반 광고 7일",
      priceKrw: 40_000,
      durationDays: 7,
      recruitmentTier: "GENERAL",
      weeklyMatchQuota: 3,
      productEntitlementId: "entitlement-general",
    });
    expect(productFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { code: "AD_GENERAL_7D" },
    }));
  });

  it("fails closed for unknown machine identity before DB access", async () => {
    await expect(getManagedAdvertisementProductByCode("GENERAL")).rejects.toThrow(
      "ADVERTISEMENT_PRODUCT_CODE_INVALID",
    );
    expect(productFindUnique).not.toHaveBeenCalled();
  });

  it("fails closed when persisted price/tier/quota drifts from locked policy", async () => {
    productFindUnique.mockResolvedValue({
      id: "product-premium",
      code: "AD_PREMIUM_7D",
      name: "프리미엄",
      price: 79_000,
      type: "ADVERTISEMENT",
      status: "ACTIVE",
      recruitmentEntitlement: {
        id: "entitlement-premium",
        recruitmentTier: "PREMIUM",
        weeklyMatchQuota: 5,
      },
    });

    await expect(getManagedAdvertisementProductByCode("AD_PREMIUM_7D")).rejects.toThrow(
      "ADVERTISEMENT_PRODUCT_POLICY_MISMATCH",
    );
  });

  it("fails closed for inactive or unentitled products", async () => {
    productFindUnique.mockResolvedValue({
      id: "product-main",
      code: "AD_MAIN_7D",
      name: "메인",
      price: 150_000,
      type: "ADVERTISEMENT",
      status: "INACTIVE",
      recruitmentEntitlement: null,
    });
    await expect(getManagedAdvertisementProductByCode("AD_MAIN_7D")).rejects.toThrow(
      "ADVERTISEMENT_PRODUCT_INACTIVE",
    );

    productFindUnique.mockResolvedValue({
      id: "product-main",
      code: "AD_MAIN_7D",
      name: "메인",
      price: 150_000,
      type: "ADVERTISEMENT",
      status: "ACTIVE",
      recruitmentEntitlement: null,
    });
    await expect(getManagedAdvertisementProductByCode("AD_MAIN_7D")).rejects.toThrow(
      "ADVERTISEMENT_PRODUCT_ENTITLEMENT_MISSING",
    );
  });
});