import type { NotificationType } from "@/generated/prisma/enums";

export const NOTIFICATION_TITLE_MAX_LENGTH = 100;
export const NOTIFICATION_BODY_MAX_LENGTH = 500;
export const NOTIFICATION_DEDUPE_KEY_MAX_LENGTH = 120;
export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE = 5;

export type CreateInAppNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  dedupeKey: string;
  expiresAt?: Date | null;
};

export type ValidatedInAppNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  dedupeKey: string;
  expiresAt: Date | null;
};

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function validateInternalHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const href = value.trim();
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(href)
  ) {
    throw new Error("NOTIFICATION_HREF_INVALID");
  }
  return href;
}

export function validateInAppNotification(
  input: CreateInAppNotificationInput,
): ValidatedInAppNotificationInput {
  const userId = input.userId.trim();
  if (!userId) throw new Error("NOTIFICATION_USER_REQUIRED");

  const title = normalizeText(input.title);
  if (!title || title.length > NOTIFICATION_TITLE_MAX_LENGTH) {
    throw new Error("NOTIFICATION_TITLE_INVALID");
  }

  const body = input.body ? normalizeText(input.body) : null;
  if (body && body.length > NOTIFICATION_BODY_MAX_LENGTH) {
    throw new Error("NOTIFICATION_BODY_INVALID");
  }

  const dedupeKey = input.dedupeKey.trim();
  if (
    !dedupeKey ||
    dedupeKey.length > NOTIFICATION_DEDUPE_KEY_MAX_LENGTH ||
    !/^[A-Za-z0-9:_-]+$/.test(dedupeKey)
  ) {
    throw new Error("NOTIFICATION_DEDUPE_KEY_INVALID");
  }

  if (input.expiresAt && Number.isNaN(input.expiresAt.getTime())) {
    throw new Error("NOTIFICATION_EXPIRY_INVALID");
  }

  return {
    userId,
    type: input.type,
    title,
    body,
    href: validateInternalHref(input.href),
    dedupeKey,
    expiresAt: input.expiresAt ?? null,
  };
}

export function parseNotificationPage(value: string | string[] | undefined): number {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= NOTIFICATION_MAX_PAGE
    ? page
    : 1;
}
