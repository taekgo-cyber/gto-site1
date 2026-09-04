import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFindMany: vi.fn(),
  campaignFindFirst: vi.fn(),
  campaignCreate: vi.fn(),
  entitlementFindMany: vi.fn(),
  entitlementFindFirst: vi.fn(),
  productFindUnique: vi.fn(),
  placementFindUnique: vi.fn(),
  jobFindFirst: vi.fn(),
  leaseFindFirst: vi.fn(),
  assertWrite: vi.fn(),
}));

vi.mock("@/lib/monetization/service", () => ({
  assertCompanyAdvertisementWriteAccess: mocks.assertWrite,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adCampaign: { findMany: mocks.campaignFindMany, findFirst: mocks.campaignFindFirst, create: mocks.campaignCreate },
    companyAdvertisementEntitlement: { findMany: mocks.entitlementFindMany, findFirst: mocks.entitlementFindFirst },
    product: { findUnique: mocks.productFindUnique },
    adPlacement: { findUnique: mocks.placementFindUnique },
    jobPost: { findFirst: mocks.jobFindFirst },
    leasePost: { findFirst: mocks.leaseFindFirst },
  },
}));

import {
  createHomepageAdvertisementCampaign,
  listHomepageAdvertisementInventory,
} from "@/lib/monetization/homepage-ads";

const now = new Date("2026-08-31T00:00:00.000Z");
import { getTrackablePublicCampaign } from "@/lib/monetization/ads";

function jobCampaign(input: {
  id: string;
  tier?: "MAIN" | "PREMIUM" | "GENERAL";
  productId?: string;
  companyId?: string;
  jobCompanyId?: string;
  status?: string;
  deletedAt?: Date | null;
}) {
  const tier = input.tier ?? "MAIN";
  const productId = input.productId ?? `product-${tier}`;
  const companyId = input.companyId ?? "company-1";
  return {
    id: input.id,
    companyId,
    productId,
    advertisementType: "RECRUITMENT_LISTING",
    jobPostId: "job-shared",
    leasePostId: null,
    title: `${tier} 공고`,
    bannerCopy: null,
    imageUrl: "javascript:bad",
    linkUrl: "https://should-not-be-used.example",
    company: { id: companyId, name: "안심운송", status: "ACTIVE", deletedAt: null },
    placement: { code: "HOME_RECRUITMENT", isActive: true },
    product: {
      code: `AD_${tier}_7D`,
      advertisementType: "RECRUITMENT_LISTING",
      recruitmentEntitlement: { recruitmentTier: tier },
    },
    jobPost: {
      id: "job-shared",
      companyId: input.jobCompanyId ?? companyId,
      status: input.status ?? "OPEN",
      deletedAt: input.deletedAt ?? null,
      publishedAt: now,
      payType: "MONTHLY",
      payAmount: 4_500_000,
      workType: "FULL_TIME",
      deadline: null,
      originRegion: { name: "서울" },
      destRegion: { name: "경기" },
      vehicleType: { name: "윙바디" },
      tonnage: { name: "5톤" },
    },
    leasePost: null,
  };
}

function bannerCampaign() {
  return {
    id: "banner-left",
    companyId: "company-banner",
    productId: "product-banner",
    advertisementType: "COMPANY_BANNER",
    jobPostId: null,
    leasePostId: null,
    title: "신뢰 운송 파트너",
    bannerCopy: "투명한 정산",
    imageUrl: null,
    linkUrl: "javascript:bad",
    company: { id: "company-banner", name: "한결물류", status: "ACTIVE", deletedAt: null },
    placement: { code: "HOME_COMPANY_LEFT", isActive: true },
    product: {
      code: "AD_COMPANY_BANNER_30D",
      advertisementType: "COMPANY_BANNER",
      recruitmentEntitlement: null,
    },
    jobPost: null,
    leasePost: null,
  };
}

describe("Homepage V3 public eligibility", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("enforces owned Job XOR Lease targets before creating a canonical campaign", async () => {
    mocks.assertWrite.mockResolvedValue({});
    mocks.productFindUnique.mockResolvedValue({
      id: "product-main",
      code: "AD_MAIN_7D",
      type: "ADVERTISEMENT",
      status: "ACTIVE",
      advertisementType: "RECRUITMENT_LISTING",
      recruitmentEntitlement: { recruitmentTier: "MAIN" },
    });
    mocks.placementFindUnique.mockResolvedValue({ id: "placement-home", code: "HOME_RECRUITMENT", isActive: true });
    mocks.jobFindFirst.mockResolvedValue({ id: "job-owned" });
    mocks.entitlementFindFirst.mockResolvedValue({ id: "ad-entitlement" });
    mocks.campaignCreate.mockResolvedValue({ id: "campaign-created", status: "PENDING" });
    const startDate = new Date("2026-08-31T01:00:00.000Z");
    const endDate = new Date("2026-09-01T01:00:00.000Z");

    await expect(createHomepageAdvertisementCampaign({
      actorUserId: "owner-1",
      companyId: "company-1",
      productCode: "AD_MAIN_7D",
      placementCode: "HOME_RECRUITMENT",
      jobPostId: "job-owned",
      title: "정상 공고",
      startDate,
      endDate,
      now,
    })).resolves.toEqual({ id: "campaign-created", status: "PENDING" });
    expect(mocks.jobFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "job-owned", companyId: "company-1", status: "OPEN", deletedAt: null }),
    }));
    expect(mocks.campaignCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ advertisementType: "RECRUITMENT_LISTING", jobPostId: "job-owned", leasePostId: null }),
    }));

    await expect(createHomepageAdvertisementCampaign({
      actorUserId: "owner-1",
      companyId: "company-1",
      productCode: "AD_MAIN_7D",
      placementCode: "HOME_RECRUITMENT",
      jobPostId: "job-owned",
      leasePostId: "lease-owned",
      title: "잘못된 공고",
      startDate,
      endDate,
      now,
    })).rejects.toThrow("ADVERTISEMENT_LISTING_TARGET_XOR_REQUIRED");
  });

  it("requests the complete canonical eligible pool without a global ten-item cap", async () => {
    mocks.campaignFindMany.mockResolvedValue([]);
    mocks.entitlementFindMany.mockResolvedValue([]);
    await listHomepageAdvertisementInventory({ now, windowKey: 0 });
    expect(mocks.campaignFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        deletedAt: null,
        startDate: { lte: now },
        endDate: { gt: now },
        advertisementType: { not: null },
        company: { status: "ACTIVE", deletedAt: null },
      }),
    }));
    expect(mocks.campaignFindMany.mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("requires an independent entitlement, ownership, publishability and product/placement compatibility", async () => {
    const validMain = jobCampaign({ id: "main-valid" });
    const duplicatePremium = jobCampaign({ id: "premium-duplicate", tier: "PREMIUM" });
    const wrongOwner = jobCampaign({ id: "wrong-owner", productId: "product-wrong", jobCompanyId: "another-company" });
    const hiddenTarget = jobCampaign({ id: "hidden", productId: "product-hidden", status: "HIDDEN" });
    const mismatched = {
      ...jobCampaign({ id: "placement-mismatch", productId: "product-mismatch" }),
      placement: { code: "HOME_COMPANY_LEFT", isActive: true },
    };
    const banner = bannerCampaign();
    mocks.campaignFindMany.mockResolvedValue([validMain, duplicatePremium, wrongOwner, hiddenTarget, mismatched, banner]);
    mocks.entitlementFindMany.mockResolvedValue([
      { companyId: "company-1", productId: "product-MAIN" },
      { companyId: "company-1", productId: "product-PREMIUM" },
      { companyId: "company-1", productId: "product-wrong" },
      { companyId: "company-1", productId: "product-hidden" },
      { companyId: "company-1", productId: "product-mismatch" },
      { companyId: "company-banner", productId: "product-banner" },
    ]);

    const result = await listHomepageAdvertisementInventory({ now, windowKey: 0 });
    expect(result.main.map((item) => item.id)).toEqual(["main-valid"]);
    expect(result.premium).toEqual([]);
    expect(result.companyLeft.map((item) => item.id)).toEqual(["banner-left"]);
    expect(result.main[0]).toMatchObject({ imageUrl: null, linkUrl: "/jobs/job-shared" });
    expect(result.companyLeft[0].linkUrl).toBe("/companies/company-banner");
  });

  it("returns no inventory without a covering advertisement entitlement", async () => {
    mocks.campaignFindMany.mockResolvedValue([jobCampaign({ id: "main-no-entitlement" })]);
    mocks.entitlementFindMany.mockResolvedValue([]);
    await expect(listHomepageAdvertisementInventory({ now, windowKey: 0 })).resolves.toEqual({
      main: [], premium: [], general: [], companyLeft: [], companyRight: [],
    });
  });

  it("delivers both complete pages and all twelve banners from the canonical pool", async () => {
    const campaigns = (["MAIN", "PREMIUM", "GENERAL"] as const).flatMap((tier, t) => Array.from({ length: [20,30,40][t] }, (_, i) => {
      const row = jobCampaign({ id: `${tier}-${i}`, tier });
      row.jobPostId = `job-${tier}-${i}`;
      row.jobPost.id = row.jobPostId;
      return row;
    }));
    const banners = ["LEFT", "RIGHT"].flatMap(side => Array.from({ length: 6 }, (_, i) => ({ ...bannerCampaign(), id: `banner-${side}-${i}`, placement: { code: `HOME_COMPANY_${side}`, isActive: true } })));
    mocks.campaignFindMany.mockResolvedValue([...campaigns, ...banners]);
    mocks.entitlementFindMany.mockResolvedValue([
      ...["MAIN", "PREMIUM", "GENERAL"].map(tier => ({ companyId: "company-1", productId: `product-${tier}` })),
      { companyId: "company-banner", productId: "product-banner" },
    ]);
    const result = await listHomepageAdvertisementInventory({ now, windowKey: 0 });
    expect(Object.values(result).map(ads => ads.length)).toEqual([20,30,40,6,6]);
    expect(new Set(Object.values(result).flat().map(ad => ad.id)).size).toBe(102);
    expect(mocks.campaignCreate).not.toHaveBeenCalled();
  });

  it.each(["MAIN", "PREMIUM", "GENERAL"] as const)("%s promotes the associated job or lease, never the campaign ID or stored generic link", async tier => {
    for (const domain of ["jobs", "lease"] as const) {
      const job = jobCampaign({ id: "campaign-id", tier });
      const targetId = `${domain}-public-entity`;
      const row = domain === "jobs" ? { ...job, jobPostId: targetId, jobPost: { ...job.jobPost, id: targetId }, linkUrl: "/jobs" } : {
        ...job, jobPostId: null, jobPost: null, leasePostId: targetId, linkUrl: "/lease",
        leasePost: { ...job.jobPost, id: targetId, status: "PUBLISHED", region: { name: "부산" } },
      };
      mocks.campaignFindMany.mockResolvedValue([row]);
      mocks.campaignFindFirst.mockResolvedValue(row);
      mocks.entitlementFindMany.mockResolvedValue([{ companyId: row.companyId, productId: row.productId }]);
      mocks.entitlementFindFirst.mockResolvedValue({ id: "entitlement" });
      const inventory = await listHomepageAdvertisementInventory({ now });
      const ad = [...inventory.main, ...inventory.premium, ...inventory.general][0];
      expect(ad.linkUrl).toBe(`/${domain}/${targetId}`);
      expect((await getTrackablePublicCampaign(row.id, now))?.linkUrl).toBe(ad.linkUrl);
      expect(mocks.campaignCreate).not.toHaveBeenCalled();
    }
  });

  it.each(["/companies", "/jobs", "/lease/unrelated", "https://example.com/offer"])("company banners use their company relation instead of stored %s", async stored => {
    const row = { ...bannerCampaign(), linkUrl: stored };
    mocks.campaignFindMany.mockResolvedValue([row]);
    mocks.campaignFindFirst.mockResolvedValue(row);
    mocks.entitlementFindMany.mockResolvedValue([{ companyId: row.companyId, productId: row.productId }]);
    mocks.entitlementFindFirst.mockResolvedValue({ id: "entitlement" });
    const inventory = await listHomepageAdvertisementInventory({ now });
    expect(inventory.companyLeft[0].linkUrl).toBe("/companies/company-banner");
    expect((await getTrackablePublicCampaign(row.id, now))?.linkUrl).toBe("/companies/company-banner");
  });
});
