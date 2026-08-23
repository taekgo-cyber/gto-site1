import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { validateMetricsDateRange } from "@/lib/leads/metrics-validation";
import { getTrackablePublicCampaign } from "@/lib/monetization/ads";

export const AD_ATTRIBUTION_COOKIE = "gto_ad_attribution";
export const AD_ATTRIBUTION_WINDOW_DAYS = 30;
export const AD_ATTRIBUTION_MAX_AGE_SECONDS = AD_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60;
const MAX_ANALYTICS_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

function normalizeClientDedupe(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new Error("ADVERTISEMENT_IMPRESSION_DEDUPE_INVALID");
  return normalized;
}

function hashDedupe(campaignId: string, raw: string): string {
  return createHash("sha256").update(`impression:${campaignId}:${raw}`, "utf8").digest("hex");
}

function normalizeAttributionToken(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new Error("ADVERTISEMENT_ATTRIBUTION_INVALID");
  return normalized;
}

async function assertActiveAdmin(actorUserId: string): Promise<void> {
  if (!actorUserId) throw new Error("ADMIN_REQUIRED");
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") throw new Error("ADMIN_REQUIRED");
}

export async function recordAdvertisementImpression(input: {
  campaignId: string;
  dedupeKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const campaign = await getTrackablePublicCampaign(input.campaignId, now);
  if (!campaign) throw new Error("ADVERTISEMENT_CAMPAIGN_NOT_TRACKABLE");
  const dedupeKey = hashDedupe(campaign.id, normalizeClientDedupe(input.dedupeKey));
  try {
    const event = await prisma.adAnalyticsEvent.create({
      data: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        placementId: campaign.placementId,
        eventType: "IMPRESSION",
        occurredAt: now,
        dedupeKey,
      },
      select: { id: true },
    });
    return { recorded: true as const, eventId: event.id };
  } catch (error) {
    if (isUniqueConflict(error)) return { recorded: false as const, duplicate: true as const };
    throw error;
  }
}

export async function recordAdvertisementClick(input: { campaignId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const campaign = await getTrackablePublicCampaign(input.campaignId, now);
  if (!campaign || !campaign.linkUrl) throw new Error("ADVERTISEMENT_CAMPAIGN_NOT_TRACKABLE");
  const attributionToken = randomBytes(32).toString("base64url");
  const event = await prisma.adAnalyticsEvent.create({
    data: {
      campaignId: campaign.id,
      companyId: campaign.companyId,
      placementId: campaign.placementId,
      eventType: "CLICK",
      occurredAt: now,
      attributionToken,
    },
    select: { id: true },
  });
  return {
    eventId: event.id,
    attributionToken,
    destination: campaign.linkUrl,
  };
}

export async function recordAdvertisementConversionFromAttribution(input: {
  attributionToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = normalizeAttributionToken(input.attributionToken);
  const windowStart = new Date(now.getTime() - AD_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const click = await prisma.adAnalyticsEvent.findFirst({
    where: {
      attributionToken: token,
      eventType: "CLICK",
      occurredAt: { gte: windowStart, lte: now },
    },
    select: { id: true, campaignId: true, companyId: true, placementId: true },
  });
  if (!click) return { recorded: false as const, reason: "INVALID_OR_EXPIRED" as const };
  try {
    const event = await prisma.adAnalyticsEvent.create({
      data: {
        campaignId: click.campaignId,
        companyId: click.companyId,
        placementId: click.placementId,
        eventType: "CONVERSION",
        occurredAt: now,
        sourceEventId: click.id,
      },
      select: { id: true },
    });
    return { recorded: true as const, eventId: event.id };
  } catch (error) {
    if (isUniqueConflict(error)) return { recorded: false as const, reason: "ALREADY_CONVERTED" as const };
    throw error;
  }
}

export type AdvertisingMetrics = {
  from: string;
  to: string;
  totals: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    clickConversionRate: number;
  };
  perCampaign: Array<{
    campaignId: string;
    title: string;
    companyName: string;
    placementName: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    clickConversionRate: number;
  }>;
  perCompany: Array<{
    companyId: string;
    companyName: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    clickConversionRate: number;
  }>;
  perPlacement: Array<{
    placementId: string;
    placementName: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    clickConversionRate: number;
  }>;
};

type EventCount = { impressions: number; clicks: number; conversions: number };

function emptyCount(): EventCount {
  return { impressions: 0, clicks: 0, conversions: 0 };
}

function addCount(target: EventCount, eventType: string, count: number): void {
  if (eventType === "IMPRESSION") target.impressions += count;
  if (eventType === "CLICK") target.clicks += count;
  if (eventType === "CONVERSION") target.conversions += count;
}

function rates(count: EventCount) {
  const rawCtr = count.impressions > 0 ? count.clicks / count.impressions : 0;
  const rawConversion = count.clicks > 0 ? count.conversions / count.clicks : 0;
  return {
    ctr: Number.isFinite(rawCtr) ? rawCtr : 0,
    clickConversionRate: Number.isFinite(rawConversion) ? rawConversion : 0,
  };
}

export async function getAdvertisingMetrics(input: {
  actorUserId: string;
  from?: string | Date | null;
  to?: string | Date | null;
  now?: Date;
}): Promise<AdvertisingMetrics> {
  await assertActiveAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  const validated = validateMetricsDateRange({ from: input.from, to: input.to });
  const to = validated.to ?? now;
  const from = validated.from ?? new Date(to.getTime() - AD_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (to.getTime() - from.getTime() > MAX_ANALYTICS_RANGE_MS) throw new Error("METRICS_DATE_RANGE_TOO_LARGE");
  const where = { occurredAt: { gte: from, lt: to } };

  const [totalRows, campaignRows, companyRows, placementRows] = await Promise.all([
    prisma.adAnalyticsEvent.groupBy({ by: ["eventType"], where, _count: { _all: true } }),
    prisma.adAnalyticsEvent.groupBy({ by: ["campaignId", "eventType"], where, _count: { _all: true } }),
    prisma.adAnalyticsEvent.groupBy({ by: ["companyId", "eventType"], where, _count: { _all: true } }),
    prisma.adAnalyticsEvent.groupBy({ by: ["placementId", "eventType"], where, _count: { _all: true } }),
  ]);

  const totals = emptyCount();
  for (const row of totalRows) addCount(totals, row.eventType, row._count._all);

  const campaignCounts = new Map<string, EventCount>();
  for (const row of campaignRows) {
    const count = campaignCounts.get(row.campaignId) ?? emptyCount();
    addCount(count, row.eventType, row._count._all);
    campaignCounts.set(row.campaignId, count);
  }
  const companyCounts = new Map<string, EventCount>();
  for (const row of companyRows) {
    if (!row.companyId) continue;
    const count = companyCounts.get(row.companyId) ?? emptyCount();
    addCount(count, row.eventType, row._count._all);
    companyCounts.set(row.companyId, count);
  }
  const placementCounts = new Map<string, EventCount>();
  for (const row of placementRows) {
    const count = placementCounts.get(row.placementId) ?? emptyCount();
    addCount(count, row.eventType, row._count._all);
    placementCounts.set(row.placementId, count);
  }

  const [campaigns, companies, placements] = await Promise.all([
    campaignCounts.size
      ? prisma.adCampaign.findMany({
          where: { id: { in: [...campaignCounts.keys()] } },
          select: {
            id: true,
            title: true,
            company: { select: { name: true } },
            placement: { select: { name: true } },
          },
        })
      : [],
    companyCounts.size
      ? prisma.company.findMany({ where: { id: { in: [...companyCounts.keys()] } }, select: { id: true, name: true } })
      : [],
    placementCounts.size
      ? prisma.adPlacement.findMany({ where: { id: { in: [...placementCounts.keys()] } }, select: { id: true, name: true } })
      : [],
  ]);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: { ...totals, ...rates(totals) },
    perCampaign: campaigns.map((campaign) => {
      const count = campaignCounts.get(campaign.id) ?? emptyCount();
      return {
        campaignId: campaign.id,
        title: campaign.title,
        companyName: campaign.company?.name ?? "업체 없음",
        placementName: campaign.placement.name,
        ...count,
        ...rates(count),
      };
    }),
    perCompany: companies.map((company) => {
      const count = companyCounts.get(company.id) ?? emptyCount();
      return { companyId: company.id, companyName: company.name, ...count, ...rates(count) };
    }),
    perPlacement: placements.map((placement) => {
      const count = placementCounts.get(placement.id) ?? emptyCount();
      return { placementId: placement.id, placementName: placement.name, ...count, ...rates(count) };
    }),
  };
}
