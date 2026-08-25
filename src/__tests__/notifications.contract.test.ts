import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preferenceFindUnique: vi.fn(),
  preferenceUpsert: vi.fn(),
  notificationUpsert: vi.fn(),
  notificationFindMany: vi.fn(),
  notificationCount: vi.fn(),
  notificationUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      findUnique: mocks.preferenceFindUnique,
      upsert: mocks.preferenceUpsert,
    },
    inAppNotification: {
      upsert: mocks.notificationUpsert,
      findMany: mocks.notificationFindMany,
      count: mocks.notificationCount,
      updateMany: mocks.notificationUpdateMany,
    },
  },
}));

import { validateInAppNotification } from "@/lib/notifications/contract";
import {
  createInAppNotification,
  markInAppNotificationRead,
} from "@/lib/notifications/service";

describe("S21 in-app notification contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preferenceFindUnique.mockResolvedValue(null);
  });

  it("rejects external or protocol-relative links", () => {
    const base = {
      userId: "user-1",
      type: "SYSTEM" as const,
      title: "안내",
      dedupeKey: "system:test",
    };
    expect(() => validateInAppNotification({ ...base, href: "https://example.com" }))
      .toThrow("NOTIFICATION_HREF_INVALID");
    expect(() => validateInAppNotification({ ...base, href: "//example.com" }))
      .toThrow("NOTIFICATION_HREF_INVALID");
  });

  it("suppresses content notifications until explicit opt-in", async () => {
    const result = await createInAppNotification({
      userId: "user-1",
      type: "CONTENT",
      title: "새 콘텐츠",
      href: "/blog",
      dedupeKey: "content:1",
    });
    expect(result).toEqual({ delivered: false, item: null });
    expect(mocks.notificationUpsert).not.toHaveBeenCalled();
  });

  it("uses the user-scoped idempotency key for system delivery", async () => {
    const item = {
      id: "notification-1",
      type: "SYSTEM",
      title: "안내",
      body: null,
      href: "/mypage",
      deliveredAt: new Date(),
      readAt: null,
      createdAt: new Date(),
    };
    mocks.notificationUpsert.mockResolvedValue(item);
    await createInAppNotification({
      userId: "user-1",
      type: "SYSTEM",
      title: "  안내  ",
      href: "/mypage",
      dedupeKey: "system:1",
    });

    expect(mocks.notificationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_dedupeKey: { userId: "user-1", dedupeKey: "system:1" } },
      create: expect.objectContaining({ userId: "user-1", title: "안내" }),
      update: {},
    }));
  });

  it("scopes read mutation to the authenticated owner and item", async () => {
    mocks.notificationUpdateMany.mockResolvedValue({ count: 1 });
    await expect(markInAppNotificationRead(
      "user-1",
      "notification-1",
      new Date("2026-08-25T00:00:00.000Z"),
    )).resolves.toBe(true);
    expect(mocks.notificationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "notification-1",
        userId: "user-1",
        readAt: null,
      }),
    }));
  });
});
