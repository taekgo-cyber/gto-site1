import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  candidateLead: { count: vi.fn() },
  leadContactUnlock: { count: vi.fn() },
  company: { count: vi.fn() },
  adCampaign: { count: vi.fn() },
  adAnalyticsEvent: { groupBy: vi.fn() },
  inAppNotification: { count: vi.fn() },
  blogArticle: { count: vi.fn() },
  blogContentJob: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getLaunchOpsSnapshot } from "@/lib/ops/service";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SITE_AVAILABILITY = "PUBLIC";
  process.env.LAUNCH_FREE_AT = "2026-10-01T00:00:00+09:00";
  process.env.LAUNCH_PAID_PRENOTICE_AT = "2026-11-01T00:00:00+09:00";
  process.env.LAUNCH_DISCOUNTED_PAID_AT = "2026-12-01T00:00:00+09:00";
  process.env.LAUNCH_STANDARD_PAID_AT = "2027-01-01T00:00:00+09:00";
  process.env.MONETIZATION_ACTIVATION_MODE = "FREE_ONLY";
});

describe("S23 admin launch operations snapshot", () => {
  it("aggregates bounded KST counts without selecting record PII", async () => {
    prismaMock.candidateLead.count.mockResolvedValue(3);
    prismaMock.leadContactUnlock.count.mockResolvedValue(2);
    prismaMock.company.count.mockResolvedValue(1);
    prismaMock.adCampaign.count.mockResolvedValue(4);
    prismaMock.adAnalyticsEvent.groupBy.mockResolvedValue([
      { eventType: "IMPRESSION", _count: { _all: 20 } },
      { eventType: "CLICK", _count: { _all: 5 } },
      { eventType: "CONVERSION", _count: { _all: 1 } },
    ]);
    prismaMock.inAppNotification.count.mockResolvedValueOnce(6).mockResolvedValueOnce(7);
    prismaMock.blogArticle.count.mockResolvedValue(2);
    prismaMock.blogContentJob.count.mockResolvedValue(1);

    const result = await getLaunchOpsSnapshot(new Date("2026-10-01T03:00:00Z"));
    expect(result).toMatchObject({
      availability: "PUBLIC",
      newLeads: 3,
      unlocks: 2,
      suspendedCompanies: 1,
      activeCampaigns: 4,
      adImpressions: 20,
      adClicks: 5,
      adConversions: 1,
      notificationsCreated: 6,
      unreadNotifications: 7,
      contentPublished: 2,
      failedContentJobs: 1,
    });
    expect(result.launchPolicy?.phase).toBe("FREE_LAUNCH");
    expect(result.window.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(prismaMock.candidateLead.count).toHaveBeenCalledWith({ where: { createdAt: { gte: result.window.start, lt: result.window.end } } });
    expect(JSON.stringify(prismaMock.candidateLead.count.mock.calls)).not.toMatch(/phone|email|name/i);
  });
});
