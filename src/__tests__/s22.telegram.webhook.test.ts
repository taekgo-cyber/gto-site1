import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ telegramWebhookReceipt: { create: vi.fn(), update: vi.fn() } }));
const enqueueMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "digest" }));
const dispatchMock = vi.hoisted(() => vi.fn().mockResolvedValue({ claimed: 1, sent: 1, failed: 0 }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ops/service", () => ({ enqueueDailyOpsDigest: enqueueMock, dispatchPendingOpsEvents: dispatchMock }));

import { processTelegramWebhook } from "@/lib/telegram/webhook";

const config = {
  botToken: `123:${"a".repeat(24)}`,
  adminChatId: "-100",
  adminUserIds: new Set(["42"]),
  webhookSecret: "s".repeat(32),
  siteUrl: "https://example.com",
};

beforeEach(() => vi.clearAllMocks());

describe("S22 Telegram webhook replay and actor boundary", () => {
  it("rejects a forged callback before storing a receipt or mutating ops state", async () => {
    const payload = { update_id: 1, callback_query: { id: "x", data: "approve-company", from: { id: 99 }, message: { chat: { id: -100 } } } };
    await expect(processTelegramWebhook({ payload, config, provider: { send: vi.fn() } })).rejects.toThrow("TELEGRAM_ACTOR_UNAUTHORIZED");
    expect(prismaMock.telegramWebhookReceipt.create).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("records update_id before command execution and treats duplicate delivery idempotently", async () => {
    const payload = { update_id: 2, message: { text: "/digest", from: { id: 42 }, chat: { id: -100 } } };
    prismaMock.telegramWebhookReceipt.create.mockResolvedValue({ updateId: "2" });
    prismaMock.telegramWebhookReceipt.update.mockResolvedValue({ updateId: "2" });
    await expect(processTelegramWebhook({ payload, config, provider: { send: vi.fn() } })).resolves.toMatchObject({ accepted: true, duplicate: false });
    expect(prismaMock.telegramWebhookReceipt.create).toHaveBeenCalledBefore(enqueueMock);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    prismaMock.telegramWebhookReceipt.create.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "P2002" }));
    await expect(processTelegramWebhook({ payload, config, provider: { send: vi.fn() } })).resolves.toMatchObject({ accepted: true, duplicate: true });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});
