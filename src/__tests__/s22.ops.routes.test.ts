import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "digest" }));
const dispatchMock = vi.hoisted(() => vi.fn().mockResolvedValue({ claimed: 1, sent: 1, failed: 0 }));
const webhookMock = vi.hoisted(() => vi.fn().mockResolvedValue({ accepted: true, duplicate: false }));
vi.mock("@/lib/ops/service", () => ({ enqueueDailyOpsDigest: enqueueMock, dispatchPendingOpsEvents: dispatchMock }));
vi.mock("@/lib/telegram/webhook", () => ({ processTelegramWebhook: webhookMock }));

import { GET as runOpsCron } from "@/app/api/cron/ops/route";
import { POST as telegramWebhook } from "@/app/api/telegram/webhook/route";

const originalCron = process.env.OPS_AUTOMATION_CRON_SECRET;
const originalWebhook = process.env.TELEGRAM_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPS_AUTOMATION_CRON_SECRET = "c".repeat(32);
  process.env.TELEGRAM_WEBHOOK_SECRET = "w".repeat(32);
});

afterEach(() => {
  if (originalCron === undefined) delete process.env.OPS_AUTOMATION_CRON_SECRET;
  else process.env.OPS_AUTOMATION_CRON_SECRET = originalCron;
  if (originalWebhook === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = originalWebhook;
});

describe("S22 ops route authorization", () => {
  it("rejects missing cron Bearer before scheduling", async () => {
    const response = await runOpsCron(new Request("http://localhost/api/cron/ops"));
    expect(response.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("accepts exact cron Bearer and runs digest plus outbox", async () => {
    const response = await runOpsCron(new Request("http://localhost/api/cron/ops", { headers: { authorization: `Bearer ${"c".repeat(32)}` } }));
    expect(response.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong Telegram secret before parsing or processing body", async () => {
    const response = await telegramWebhook(new Request("http://localhost/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "x".repeat(32) }, body: JSON.stringify({ update_id: 1 }) }));
    expect(response.status).toBe(401);
    expect(webhookMock).not.toHaveBeenCalled();
  });

  it("passes an authenticated JSON update to the replay-protected service", async () => {
    const response = await telegramWebhook(new Request("http://localhost/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "w".repeat(32) }, body: JSON.stringify({ update_id: 1 }) }));
    expect(response.status).toBe(200);
    expect(webhookMock).toHaveBeenCalledWith({ payload: { update_id: 1 } });
  });
});
