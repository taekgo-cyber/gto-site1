import type { Prisma, NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_RETENTION_DAYS,
  type CreateInAppNotificationInput,
  validateInAppNotification,
} from "./contract";

type NotificationClient = Pick<
  Prisma.TransactionClient,
  "inAppNotification" | "notificationPreference"
>;

export type NotificationPreferenceState = {
  activityEnabled: boolean;
  contentEnabled: boolean;
};

export type InAppNotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  deliveredAt: Date;
  readAt: Date | null;
  createdAt: Date;
};

export type InAppNotificationPage = {
  items: InAppNotificationItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
}

function visibleNotificationWhere(userId: string, now: Date) {
  return {
    userId,
    createdAt: { gte: retentionCutoff(now) },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export async function getNotificationPreferences(
  userId: string,
  client: NotificationClient = prisma,
): Promise<NotificationPreferenceState> {
  const row = await client.notificationPreference.findUnique({
    where: { userId },
    select: { activityEnabled: true, contentEnabled: true },
  });
  return row ?? { activityEnabled: true, contentEnabled: false };
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferenceState,
  client: NotificationClient = prisma,
): Promise<NotificationPreferenceState> {
  return client.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
    select: { activityEnabled: true, contentEnabled: true },
  });
}

export async function createInAppNotification(
  input: CreateInAppNotificationInput,
  client: NotificationClient = prisma,
): Promise<{ delivered: boolean; item: InAppNotificationItem | null }> {
  const data = validateInAppNotification(input);
  if (data.type !== "SYSTEM") {
    const preferences = await getNotificationPreferences(data.userId, client);
    if (data.type === "ACTIVITY" && !preferences.activityEnabled) {
      return { delivered: false, item: null };
    }
    if (data.type === "CONTENT" && !preferences.contentEnabled) {
      return { delivered: false, item: null };
    }
  }

  const item = await client.inAppNotification.upsert({
    where: {
      userId_dedupeKey: {
        userId: data.userId,
        dedupeKey: data.dedupeKey,
      },
    },
    create: data,
    update: {},
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      deliveredAt: true,
      readAt: true,
      createdAt: true,
    },
  });
  return { delivered: true, item };
}

export async function listInAppNotifications(
  userId: string,
  page: number,
  now = new Date(),
): Promise<InAppNotificationPage> {
  const where = visibleNotificationWhere(userId, now);
  const [items, totalCount] = await Promise.all([
    prisma.inAppNotification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        deliveredAt: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * NOTIFICATION_PAGE_SIZE,
      take: NOTIFICATION_PAGE_SIZE,
    }),
    prisma.inAppNotification.count({ where }),
  ]);

  return {
    items,
    page,
    pageSize: NOTIFICATION_PAGE_SIZE,
    totalCount,
    totalPages: Math.min(Math.ceil(totalCount / NOTIFICATION_PAGE_SIZE), 5),
  };
}

export async function countUnreadInAppNotifications(
  userId: string,
  now = new Date(),
): Promise<number> {
  return prisma.inAppNotification.count({
    where: { ...visibleNotificationWhere(userId, now), readAt: null },
  });
}

export async function markInAppNotificationRead(
  userId: string,
  notificationId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await prisma.inAppNotification.updateMany({
    where: {
      ...visibleNotificationWhere(userId, now),
      id: notificationId,
      readAt: null,
    },
    data: { readAt: now },
  });
  return result.count > 0;
}

export async function markAllInAppNotificationsRead(
  userId: string,
  now = new Date(),
): Promise<number> {
  const result = await prisma.inAppNotification.updateMany({
    where: {
      ...visibleNotificationWhere(userId, now),
      readAt: null,
    },
    data: { readAt: now },
  });
  return result.count;
}
