import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  eventCreate: vi.fn(),
  eventFindFirst: vi.fn(),
  eventGroupBy: vi.fn(),
  campaignFindMany: vi.fn(),
  companyFindMany: vi.fn(),
  placementFindMany: vi.fn(),
  trackableCampaign: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    adAnalyticsEvent: {
      create: mocks.eventCreate,
      findFirst: mocks.eventFindFirst,
      groupBy: mocks.eventGroupBy,
    },
    adCampaign: { findMany: mocks.campaignFindMany },
    company: { findMany: mocks.companyFindMany },
    adPlacement: { findMany: mocks.placementFindMany },
  },
}));

vi.mock("@/lib/monetization/ads", () => ({
  getTrackablePublicCampaign: mocks.trackableCampaign,
}));

import {
  AD_ATTRIBUTION_WINDOW_DAYS,
  getAdvertisingMetrics,
  recordAdvertisementClick,
  recordAdvertisementConversionFromAttribution,
  recordAdvertisementImpression,
} from "@/lib/analytics/ads";

const now = new Date("2026-08-24T05:00:00.000Z");
const trackable = {
  id: "campaign-1",
  companyId: "company-1",
  placementId: "placement-1",
  title: "테스트 캠페인",
  linkUrl: "/mypage/lead",
};

function p2002() {
  return Object.assign(new Error("unique"), { code: "P2002" });
}

describe("canonical Session 16 advertising analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.trackableCampaign.mockResolvedValue(trackable);
    mocks.eventCreate.mockResolvedValue({ id: "event-1" });
    mocks.eventGroupBy.mockResolvedValue([]);
    mocks.campaignFindMany.mockResolvedValue([]);
    mocks.companyFindMany.mockResolvedValue([]);
    mocks.placementFindMany.mockResolvedValue([]);
  });

  it("records an impression with a one-way hashed dedupe key and no raw fingerprint fields", async () => {
    const rawDedupe = "campaign-1:/home:page-load-raw";
    const result = await recordAdvertisementImpression({
      campaignId: "campaign-1",
      dedupeKey: rawDedupe,
      now,
    });

    expect(result).toEqual({ recorded: true, eventId: "event-1" });
    const createArg = mocks.eventCreate.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      campaignId: "campaign-1",
      companyId: "company-1",
      placementId: "placement-1",
      eventType: "IMPRESSION",
      occurredAt: now,
    });
    expect(createArg.data.dedupeKey).not.toBe(rawDedupe);
    expect(createArg.data.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
    const stored = JSON.stringify(createArg.data);
    expect(stored).not.toContain(rawDedupe);
    expect(stored).not.toMatch(/userAgent|ipAddress|phone|email/i);
  });

  it("dedupes repeated impression writes without creating a second logical event", async () => {
    mocks.eventCreate.mockRejectedValueOnce(p2002());
    await expect(recordAdvertisementImpression({
      campaignId: "campaign-1",
      dedupeKey: "same-page-load",
      now,
    })).resolves.toEqual({ recorded: false, duplicate: true });
  });

  it("fails closed for an inactive or otherwise untrackable campaign", async () => {
    mocks.trackableCampaign.mockResolvedValueOnce(null);
    await expect(recordAdvertisementImpression({
      campaignId: "inactive",
      dedupeKey: "page-load",
      now,
    })).rejects.toThrow("ADVERTISEMENT_CAMPAIGN_NOT_TRACKABLE");
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("records a click with an opaque attribution token and authoritative destination", async () => {
    const result = await recordAdvertisementClick({ campaignId: "campaign-1", now });
    expect(result.destination).toBe("/mypage/lead");
    expect(result.attributionToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const createArg = mocks.eventCreate.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      campaignId: "campaign-1",
      companyId: "company-1",
      placementId: "placement-1",
      eventType: "CLICK",
      occurredAt: now,
      attributionToken: result.attributionToken,
    });
    expect(JSON.stringify(createArg.data)).not.toMatch(/userAgent|ipAddress|phone|email/i);
  });

  it("rejects forged or expired attribution without writing a conversion", async () => {
    mocks.eventFindFirst.mockResolvedValueOnce(null);
    await expect(recordAdvertisementConversionFromAttribution({
      attributionToken: "forged-token",
      now,
    })).resolves.toEqual({ recorded: false, reason: "INVALID_OR_EXPIRED" });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(mocks.eventFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventType: "CLICK",
        attributionToken: "forged-token",
        occurredAt: {
          gte: new Date(now.getTime() - AD_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
          lte: now,
        },
      }),
    }));
  });

  it("records at most one conversion for one valid click", async () => {
    mocks.eventFindFirst.mockResolvedValue({
      id: "click-1",
      campaignId: "campaign-1",
      companyId: "company-1",
      placementId: "placement-1",
    });
    mocks.eventCreate.mockResolvedValueOnce({ id: "conversion-1" });
    const first = await recordAdvertisementConversionFromAttribution({ attributionToken: "valid-token", now });
    expect(first).toEqual({ recorded: true, eventId: "conversion-1" });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: {
        campaignId: "campaign-1",
        companyId: "company-1",
        placementId: "placement-1",
        eventType: "CONVERSION",
        occurredAt: now,
        sourceEventId: "click-1",
      },
      select: { id: true },
    });

    mocks.eventCreate.mockRejectedValueOnce(p2002());
    await expect(recordAdvertisementConversionFromAttribution({ attributionToken: "valid-token", now }))
      .resolves.toEqual({ recorded: false, reason: "ALREADY_CONVERTED" });
  });

  it("requires an ACTIVE ADMIN before reading advertising metrics", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ role: "USER", status: "ACTIVE" });
    await expect(getAdvertisingMetrics({ actorUserId: "user-1", now })).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.eventGroupBy).not.toHaveBeenCalled();
  });

  it("returns finite zero rates for empty denominators", async () => {
    const result = await getAdvertisingMetrics({ actorUserId: "admin-1", now });
    expect(result.totals).toEqual({
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      clickConversionRate: 0,
    });
    expect(Number.isFinite(result.totals.ctr)).toBe(true);
    expect(Number.isFinite(result.totals.clickConversionRate)).toBe(true);
  });

  it("aggregates impression, click and conversion funnels by campaign/company/placement", async () => {
    mocks.eventGroupBy.mockImplementation(async ({ by }: { by: string[] }) => {
      if (by.length === 1) {
        return [
          { eventType: "IMPRESSION", _count: { _all: 10 } },
          { eventType: "CLICK", _count: { _all: 2 } },
          { eventType: "CONVERSION", _count: { _all: 1 } },
        ];
      }
      const dimension = by[0];
      const id = dimension === "campaignId" ? "campaign-1" : dimension === "companyId" ? "company-1" : "placement-1";
      return [
        { [dimension]: id, eventType: "IMPRESSION", _count: { _all: 10 } },
        { [dimension]: id, eventType: "CLICK", _count: { _all: 2 } },
        { [dimension]: id, eventType: "CONVERSION", _count: { _all: 1 } },
      ];
    });
    mocks.campaignFindMany.mockResolvedValueOnce([{ id: "campaign-1", title: "캠페인", company: { name: "광고주" }, placement: { name: "홈 상단" } }]);
    mocks.companyFindMany.mockResolvedValueOnce([{ id: "company-1", name: "광고주" }]);
    mocks.placementFindMany.mockResolvedValueOnce([{ id: "placement-1", name: "홈 상단" }]);

    const result = await getAdvertisingMetrics({
      actorUserId: "admin-1",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-25T00:00:00.000Z",
      now,
    });
    expect(result.totals).toMatchObject({ impressions: 10, clicks: 2, conversions: 1, ctr: 0.2, clickConversionRate: 0.5 });
    expect(result.perCampaign[0]).toMatchObject({ impressions: 10, clicks: 2, conversions: 1, ctr: 0.2, clickConversionRate: 0.5 });
    expect(result.perCompany[0]).toMatchObject({ companyName: "광고주", impressions: 10, clicks: 2, conversions: 1 });
    expect(result.perPlacement[0]).toMatchObject({ placementName: "홈 상단", impressions: 10, clicks: 2, conversions: 1 });
  });

  it("rejects analytics date ranges larger than 90 days", async () => {
    await expect(getAdvertisingMetrics({
      actorUserId: "admin-1",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
      now,
    })).rejects.toThrow("METRICS_DATE_RANGE_TOO_LARGE");
    expect(mocks.eventGroupBy).not.toHaveBeenCalled();
  });
});
