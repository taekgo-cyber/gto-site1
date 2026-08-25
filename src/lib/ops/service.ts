import { prisma } from "@/lib/prisma";
import { createTelegramBotProvider, type TelegramMessage, type TelegramProvider } from "@/lib/telegram/provider";
import { logOperationalError } from "@/lib/observability/logger";
import {
  getKstDayWindow,
  resolveRuntimeLaunchPolicy,
  resolveRuntimeSiteAvailability,
} from "@/lib/launch/policy";

const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_LOCK_MS = 10 * 60 * 1_000;

type OpsPayload = Record<string, unknown>;

function objectPayload(payload: unknown): OpsPayload {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as OpsPayload) : {};
}

function stringField(payload: OpsPayload, field: string, fallback = "-"): string {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
}

function numberField(payload: OpsPayload, field: string): number {
  const value = payload[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildOpsTelegramMessage(event: { type: string; targetId: string; payload: unknown }): TelegramMessage {
  const payload = objectPayload(event.payload);
  const adminPath = stringField(payload, "adminPath", "");
  if (event.type === "COMPANY_APPLICATION") {
    return {
      text: [
        "[지입몰 업체 승인 필요]",
        `업체: ${stringField(payload, "companyName")}`,
        `지역: ${stringField(payload, "regionName", "미입력")}`,
        `신청: ${stringField(payload, "createdAt")}`,
      ].join("\n"),
      adminPath: adminPath || `/admin/companies/${event.targetId}`,
    };
  }
  if (event.type === "SUPPORT_TICKET") {
    return {
      text: [
        "[지입몰 신규 문의]",
        `문의: ${event.targetId}`,
        `유형: ${stringField(payload, "category")}`,
        `고객: ${stringField(payload, "requesterDisplayName", "고객")}`,
        `중요도: ${stringField(payload, "priority", "NORMAL")}`,
        `요약: ${stringField(payload, "summary")}`,
      ].join("\n"),
      adminPath: adminPath || `/admin/tickets/${event.targetId}`,
    };
  }
  if (event.type === "DAILY_DIGEST") {
    return {
      text: [
        `[지입몰 오늘의 운영 업무 · ${stringField(payload, "date")}]`,
        `업체 승인 ${numberField(payload, "pendingCompanies")}건`,
        `미처리 문의 ${numberField(payload, "openTickets")}건 (긴급 ${numberField(payload, "urgentTickets")}건, 장기대기 ${numberField(payload, "staleTickets")}건)`,
        `상태 예외 ${numberField(payload, "anomalies")}건`,
        `전송 실패 ${numberField(payload, "failedDeliveries")}건`,
      ].join("\n"),
      adminPath: adminPath || "/admin/ops",
    };
  }
  return {
    text: `[지입몰 운영 예외]\n대상: ${event.targetId}\n요약: ${stringField(payload, "summary")}`,
    adminPath: adminPath || "/admin/ops",
  };
}

function kstDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function getDailyOpsCounts(now: Date = new Date()) {
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const openStatuses = ["OPEN", "IN_PROGRESS"] as const;
  const [pendingCompanies, openTickets, urgentTickets, staleTickets, companiesWithoutOwner, expiredActiveAds, failedDeliveries] =
    await Promise.all([
      prisma.company.count({ where: { status: "PENDING", deletedAt: null } }),
      prisma.supportTicket.count({ where: { status: { in: [...openStatuses] } } }),
      prisma.supportTicket.count({ where: { status: { in: [...openStatuses] }, priority: "URGENT" } }),
      prisma.supportTicket.count({ where: { status: { in: [...openStatuses] }, createdAt: { lt: staleBefore } } }),
      prisma.company.count({
        where: { status: "ACTIVE", deletedAt: null, members: { none: { role: "OWNER", status: "ACTIVE" } } },
      }),
      prisma.adCampaign.count({ where: { status: "ACTIVE", deletedAt: null, endDate: { lt: now } } }),
      prisma.opsEvent.count({ where: { status: "FAILED" } }),
    ]);
  return {
    pendingCompanies,
    openTickets,
    urgentTickets,
    staleTickets,
    companiesWithoutOwner,
    expiredActiveAds,
    anomalies: companiesWithoutOwner + expiredActiveAds,
    failedDeliveries,
  };
}

export async function enqueueDailyOpsDigest(now: Date = new Date()) {
  const date = kstDateKey(now);
  const counts = await getDailyOpsCounts(now);
  const data = {
    type: "DAILY_DIGEST" as const,
    dedupeKey: `ops-digest:${date}`,
    targetType: "OpsDigest",
    targetId: date,
    payload: { date, ...counts, adminPath: "/admin/ops" },
  };
  try {
    return await prisma.opsEvent.create({ data, select: { id: true, status: true, dedupeKey: true } });
  } catch (error) {
    if ((error as { code?: string })?.code !== "P2002") throw error;
    const existing = await prisma.opsEvent.findUnique({ where: { dedupeKey: data.dedupeKey }, select: { id: true, status: true, dedupeKey: true } });
    if (!existing) throw error;
    return existing;
  }
}

function classifyDeliveryFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "TELEGRAM_NOT_CONFIGURED") return "PROVIDER_NOT_CONFIGURED";
  if (message.startsWith("TELEGRAM_HTTP_")) return message.slice(0, 40);
  if (message === "TELEGRAM_PROVIDER_INVALID_RESPONSE" || message === "TELEGRAM_MESSAGE_INVALID") return message;
  if (error instanceof DOMException && error.name === "TimeoutError") return "PROVIDER_TIMEOUT";
  return "PROVIDER_FAILURE";
}

export async function dispatchPendingOpsEvents(input: {
  now?: Date;
  batchSize?: number;
  provider?: TelegramProvider;
}) {
  const now = input.now ?? new Date();
  const batchSize = Math.max(1, Math.min(20, Math.floor(input.batchSize ?? 10)));
  await prisma.opsEvent.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: "FAILED", lockedAt: null, lastErrorCode: "STALE_CLAIM", nextAttemptAt: now },
  });
  const due = await prisma.opsEvent.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      nextAttemptAt: { lte: now },
    },
    select: { id: true },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });
  let sent = 0;
  let failed = 0;
  for (const candidate of due) {
    const claimed = await prisma.opsEvent.updateMany({
      where: { id: candidate.id, status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: MAX_DELIVERY_ATTEMPTS } },
      data: { status: "PROCESSING", lockedAt: now, attemptCount: { increment: 1 }, lastErrorCode: null },
    });
    if (claimed.count === 0) continue;
    const event = await prisma.opsEvent.findUnique({
      where: { id: candidate.id },
      select: { id: true, type: true, targetId: true, payload: true, attemptCount: true },
    });
    if (!event) continue;
    try {
      const provider = input.provider ?? createTelegramBotProvider();
      const delivered = await provider.send(buildOpsTelegramMessage(event));
      await prisma.opsEvent.update({
        where: { id: event.id },
        data: { status: "SENT", sentAt: now, lockedAt: null, telegramMessageId: delivered.messageId },
      });
      sent += 1;
    } catch (error) {
      logOperationalError({
        operation: "ops_event_delivery",
        actorType: "SYSTEM",
        category: "PROVIDER",
        error,
        identifiers: { eventId: event.id },
      });
      const delayMinutes = Math.min(60, 2 ** Math.max(0, event.attemptCount - 1));
      await prisma.opsEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          lockedAt: null,
          lastErrorCode: classifyDeliveryFailure(error),
          nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
        },
      });
      failed += 1;
    }
  }
  return { claimed: sent + failed, sent, failed };
}

async function assertActiveAdmin(adminUserId: string) {
  const user = await prisma.user.findUnique({ where: { id: adminUserId }, select: { role: true, status: true } });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") throw new Error("ADMIN_REQUIRED");
}

export async function getAdminOpsOverview(adminUserId: string, now: Date = new Date()) {
  await assertActiveAdmin(adminUserId);
  const [counts, launch, events] = await Promise.all([
    getDailyOpsCounts(now),
    getLaunchOpsSnapshot(now),
    prisma.opsEvent.findMany({
      select: { id: true, type: true, targetType: true, targetId: true, status: true, attemptCount: true, lastErrorCode: true, nextAttemptAt: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return { counts, launch, events };
}

export async function getLaunchOpsSnapshot(now: Date = new Date()) {
  const { start, end } = getKstDayWindow(now);
  const [
    newLeads,
    unlocks,
    suspendedCompanies,
    activeCampaigns,
    adEvents,
    notificationsCreated,
    unreadNotifications,
    contentPublished,
    failedContentJobs,
  ] = await Promise.all([
    prisma.candidateLead.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.leadContactUnlock.count({ where: { unlockedAt: { gte: start, lt: end } } }),
    prisma.company.count({ where: { status: "SUSPENDED", deletedAt: null } }),
    prisma.adCampaign.count({
      where: { status: "ACTIVE", deletedAt: null, startDate: { lte: now }, endDate: { gt: now } },
    }),
    prisma.adAnalyticsEvent.groupBy({
      by: ["eventType"],
      where: { occurredAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.inAppNotification.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.inAppNotification.count({ where: { readAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.blogArticle.count({ where: { status: "PUBLISHED", publishedAt: { gte: start, lt: end } } }),
    prisma.blogContentJob.count({ where: { status: "FAILED" } }),
  ]);
  const adCount = Object.fromEntries(adEvents.map((row) => [row.eventType, row._count._all]));

  let launchPolicy: ReturnType<typeof resolveRuntimeLaunchPolicy> | null = null;
  let launchPolicyError: "INVALID_CONFIG" | null = null;
  try {
    launchPolicy = resolveRuntimeLaunchPolicy(now);
  } catch (error) {
    launchPolicyError = "INVALID_CONFIG";
    logOperationalError({
      operation: "launch_policy_resolve",
      actorType: "SYSTEM",
      category: "POLICY",
      error,
      identifiers: { route: "/admin/ops" },
    });
  }

  return {
    window: { start, end },
    availability: resolveRuntimeSiteAvailability(),
    launchPolicy,
    launchPolicyError,
    newLeads,
    unlocks,
    suspendedCompanies,
    activeCampaigns,
    adImpressions: adCount.IMPRESSION ?? 0,
    adClicks: adCount.CLICK ?? 0,
    adConversions: adCount.CONVERSION ?? 0,
    notificationsCreated,
    unreadNotifications,
    contentPublished,
    failedContentJobs,
  };
}

export async function retryOpsEvent(input: { adminUserId: string; eventId: string; now?: Date }) {
  await assertActiveAdmin(input.adminUserId);
  const now = input.now ?? new Date();
  const updated = await prisma.opsEvent.updateMany({
    where: { id: input.eventId, status: "FAILED" },
    data: { status: "PENDING", attemptCount: 0, nextAttemptAt: now, lockedAt: null, lastErrorCode: null },
  });
  if (updated.count === 0) throw new Error("OPS_EVENT_NOT_RETRYABLE");
  await prisma.adminLog.create({
    data: { adminId: input.adminUserId, action: "OPS_EVENT_RETRY", targetType: "OpsEvent", targetId: input.eventId },
  });
}
