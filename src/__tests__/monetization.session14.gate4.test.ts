import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWrite: vi.fn(),
  managedProduct: vi.fn(),
  listEntitlements: vi.fn(),
  userFindUnique: vi.fn(),
  regionFindUnique: vi.fn(),
  placementFindUnique: vi.fn(),
  placementFindMany: vi.fn(),
  placementUpsert: vi.fn(),
  entitlementFindFirst: vi.fn(),
  entitlementFindMany: vi.fn(),
  campaignCreate: vi.fn(),
  campaignFindUnique: vi.fn(),
  campaignFindMany: vi.fn(),
  campaignUpdateMany: vi.fn(),
  productUpsert: vi.fn(),
  productEntitlementUpsert: vi.fn(),
  adminLogCreate: vi.fn(),
}));

vi.mock("@/lib/monetization/service", () => ({
  assertCompanyAdvertisementWriteAccess: mocks.assertWrite,
  getManagedAdvertisementProductByCode: mocks.managedProduct,
  listActiveCompanyAdvertisementEntitlements: mocks.listEntitlements,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    adCampaign: { findUnique: mocks.campaignFindUnique, updateMany: mocks.campaignUpdateMany },
    companyRecruitmentEntitlement: { findFirst: mocks.entitlementFindFirst, findMany: mocks.entitlementFindMany },
    product: { upsert: mocks.productUpsert },
    productRecruitmentEntitlement: { upsert: mocks.productEntitlementUpsert },
    adminLog: { create: mocks.adminLogCreate },
  };
  return {
    prisma: {
      user: { findUnique: mocks.userFindUnique },
      region: { findUnique: mocks.regionFindUnique },
      adPlacement: {
        findUnique: mocks.placementFindUnique,
        findMany: mocks.placementFindMany,
        upsert: mocks.placementUpsert,
      },
      companyRecruitmentEntitlement: { findFirst: mocks.entitlementFindFirst, findMany: mocks.entitlementFindMany },
      adCampaign: {
        create: mocks.campaignCreate,
        findUnique: mocks.campaignFindUnique,
        findMany: mocks.campaignFindMany,
        updateMany: mocks.campaignUpdateMany,
      },
      adminLog: { create: mocks.adminLogCreate },
      $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx),
    },
  };
});

import {
  createCompanyAdvertisementCampaign,
  listPublicAdvertisementCampaigns,
  normalizeAdvertisementUrl,
  setAdvertisementCampaignStatusByAdmin,
  syncManagedAdvertisementCatalog,
} from "@/lib/monetization/ads";

const now = new Date("2026-08-24T01:00:00.000Z");
const startDate = new Date("2026-08-24T02:00:00.000Z");
const endDate = new Date("2026-08-25T02:00:00.000Z");

describe("Session 14 Gate 4 advertisement operations", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.assertWrite.mockResolvedValue({});
    mocks.managedProduct.mockResolvedValue({
      productId: "product-1",
      productEntitlementId: "product-ent-1",
      code: "AD_GENERAL_7D",
      displayName: "일반 광고 7일",
      priceKrw: 40_000,
      durationDays: 7,
      recruitmentTier: "GENERAL",
      weeklyMatchQuota: 3,
    });
    mocks.placementFindUnique.mockResolvedValue({ id: "placement-1", code: "HOME_TOP", name: "홈 상단", isActive: true });
    mocks.entitlementFindFirst.mockResolvedValue({ id: "company-ent-1", recruitmentTier: "GENERAL", validFrom: now, expiresAt: new Date("2026-08-31T01:00:00.000Z") });
    mocks.entitlementFindMany.mockResolvedValue([
      { companyId: "company-1", productEntitlementId: "product-ent-1" },
      { companyId: "company-2", productEntitlementId: "product-ent-2" },
    ]);
    mocks.campaignCreate.mockResolvedValue({ id: "campaign-1", status: "PENDING", startDate, endDate });
  });

  it("accepts only internal or HTTPS ad URLs", () => {
    expect(normalizeAdvertisementUrl("/jobs/123", "link")).toBe("/jobs/123");
    expect(normalizeAdvertisementUrl("https://example.com/x", "link")).toBe("https://example.com/x");
    expect(() => normalizeAdvertisementUrl("http://example.com/x", "link")).toThrow("ADVERTISEMENT_LINK_URL_INVALID");
    expect(() => normalizeAdvertisementUrl("javascript:alert(1)", "link")).toThrow("ADVERTISEMENT_LINK_URL_INVALID");
    expect(() => normalizeAdvertisementUrl("//evil.example/x", "image")).toThrow("ADVERTISEMENT_IMAGE_URL_INVALID");
  });

  it("creates a company campaign as PENDING only after write, placement and entitlement checks", async () => {
    await expect(createCompanyAdvertisementCampaign({
      actorUserId: "owner-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      placementCode: "HOME_TOP",
      title: "안전한 광고",
      linkUrl: "/jobs",
      startDate,
      endDate,
      now,
    })).resolves.toMatchObject({ id: "campaign-1", status: "PENDING" });

    expect(mocks.assertWrite).toHaveBeenCalledWith({ actorUserId: "owner-1", companyId: "company-1" });
    expect(mocks.entitlementFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-1", productEntitlementId: "product-ent-1" }),
    }));
    expect(mocks.campaignCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ companyId: "company-1", productId: "product-1", placementId: "placement-1", status: "PENDING" }),
    }));
  });

  it("rejects a campaign that exceeds the active entitlement window", async () => {
    mocks.entitlementFindFirst.mockResolvedValue(null);
    await expect(createCompanyAdvertisementCampaign({
      actorUserId: "owner-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      placementCode: "HOME_TOP",
      title: "기간 초과 광고",
      startDate,
      endDate,
      now,
    })).rejects.toThrow("ADVERTISEMENT_CAMPAIGN_ENTITLEMENT_INVALID");
    expect(mocks.campaignCreate).not.toHaveBeenCalled();
  });

  it("public query requests ACTIVE/effective/non-deleted campaigns and strips unsafe legacy URLs", async () => {
    mocks.campaignFindMany.mockResolvedValue([
      { id: "c1", companyId: "company-1", title: "정상", imageUrl: "https://img.example/a.png", linkUrl: "/jobs", sortOrder: 1, company: { name: "업체A" }, product: { recruitmentEntitlement: { id: "product-ent-1" } } },
      { id: "c2", companyId: "company-2", title: "legacy", imageUrl: "javascript:bad", linkUrl: "data:text/html,bad", sortOrder: 0, company: { name: "업체B" }, product: { recruitmentEntitlement: { id: "product-ent-2" } } },
    ]);
    const result = await listPublicAdvertisementCampaigns({ placementCode: "home_top", now, limit: 99 });
    expect(mocks.campaignFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        deletedAt: null,
        startDate: { lte: now },
        endDate: { gt: now },
        regionId: null,
      }),
      take: 10,
    }));
    expect(result[0]).toMatchObject({ linkUrl: "/jobs", companyName: "업체A" });
    expect(result[1]).toMatchObject({ imageUrl: null, linkUrl: null });
    expect(mocks.entitlementFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ cancelledAt: null }),
    }));
  });

  it("allows ACTIVE transition only after admin and current campaign invariants are rechecked", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    mocks.campaignFindUnique.mockResolvedValue({
      id: "campaign-1",
      status: "PENDING",
      companyId: "company-1",
      productId: "product-1",
      startDate,
      endDate,
      deletedAt: null,
      company: { status: "ACTIVE" },
      product: { code: "AD_GENERAL_7D", type: "ADVERTISEMENT", status: "ACTIVE", recruitmentEntitlement: { id: "product-ent-1" } },
      placement: { isActive: true },
    });
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
    mocks.adminLogCreate.mockResolvedValue({ id: "log-1" });

    await expect(setAdvertisementCampaignStatusByAdmin({ actorUserId: "admin-1", campaignId: "campaign-1", status: "ACTIVE", now })).resolves.toEqual({ id: "campaign-1", status: "ACTIVE" });
    expect(mocks.entitlementFindFirst).toHaveBeenCalled();
    expect(mocks.entitlementFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ cancelledAt: null }),
    }));
    expect(mocks.adminLogCreate).toHaveBeenCalled();
  });

  it("rejects invalid lifecycle transitions before mutation", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    mocks.campaignFindUnique.mockResolvedValue({ id: "campaign-1", status: "CANCELLED", deletedAt: null });
    await expect(setAdvertisementCampaignStatusByAdmin({ actorUserId: "admin-1", campaignId: "campaign-1", status: "ACTIVE", now })).rejects.toThrow("ADVERTISEMENT_CAMPAIGN_TRANSITION_INVALID");
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });

  it("syncs the three managed Product and entitlement definitions without touching Orders", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    mocks.productUpsert.mockImplementation(async ({ where }: { where: { code: string } }) => ({ id: `product-${where.code}`, code: where.code }));
    mocks.productEntitlementUpsert.mockResolvedValue({ id: "product-ent" });
    mocks.adminLogCreate.mockResolvedValue({ id: "log-1" });
    const result = await syncManagedAdvertisementCatalog({ actorUserId: "admin-1" });
    expect(result).toEqual(["AD_GENERAL_7D", "AD_PREMIUM_7D", "AD_MAIN_7D"]);
    expect(mocks.productUpsert).toHaveBeenCalledTimes(3);
    for (const call of mocks.productUpsert.mock.calls) {
      expect(call[0].update).not.toHaveProperty("status");
    }
    expect(mocks.productEntitlementUpsert).toHaveBeenCalledTimes(3);
  });
});
