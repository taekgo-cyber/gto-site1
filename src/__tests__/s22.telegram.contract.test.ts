import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeTelegramActor,
  getTelegramConfig,
  parseTelegramUpdate,
  verifyTelegramWebhookSecret,
} from "@/lib/telegram/contract";
import { createTelegramBotProvider } from "@/lib/telegram/provider";

const env = {
  NODE_ENV: "production",
  TELEGRAM_BOT_TOKEN: `12345:${"a".repeat(24)}`,
  TELEGRAM_ADMIN_CHAT_ID: "-100123",
  TELEGRAM_ADMIN_USER_IDS: "42,77",
  TELEGRAM_WEBHOOK_SECRET: "s".repeat(32),
  NEXT_PUBLIC_SITE_URL: "https://example.com",
} as NodeJS.ProcessEnv;

afterEach(() => vi.unstubAllGlobals());

describe("S22 Telegram security contract", () => {
  it("fails closed when any server-side provider authorization value is missing", () => {
    expect(() => getTelegramConfig({ ...env, TELEGRAM_BOT_TOKEN: "" })).toThrow("TELEGRAM_NOT_CONFIGURED");
    expect(() => getTelegramConfig({ ...env, TELEGRAM_ADMIN_USER_IDS: "" })).toThrow("TELEGRAM_NOT_CONFIGURED");
    expect(() => getTelegramConfig({ ...env, TELEGRAM_WEBHOOK_SECRET: "short" })).toThrow("TELEGRAM_NOT_CONFIGURED");
    expect(() => getTelegramConfig({ ...env, NEXT_PUBLIC_SITE_URL: "http://example.com" })).toThrow("TELEGRAM_NOT_CONFIGURED");
  });

  it("validates webhook secret and both chat/user authorization", () => {
    const config = getTelegramConfig(env);
    expect(verifyTelegramWebhookSecret("s".repeat(32), env)).toBe(true);
    expect(verifyTelegramWebhookSecret("x".repeat(32), env)).toBe(false);
    expect(authorizeTelegramActor({ update_id: 1, message: { text: "/digest", chat: { id: -100123 }, from: { id: 42 } } }, config)).toBe(true);
    expect(authorizeTelegramActor({ update_id: 2, message: { text: "/digest", chat: { id: -100123 }, from: { id: 99 } } }, config)).toBe(false);
    expect(authorizeTelegramActor({ update_id: 3, callback_query: { id: "f", data: "approve", from: { id: 42 }, message: { chat: { id: -999 } } } }, config)).toBe(false);
  });

  it("rejects malformed updates before processing", () => {
    expect(parseTelegramUpdate({ message: {} })).toBeNull();
    expect(parseTelegramUpdate({ update_id: "1" })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1 })).toEqual({ update_id: 1 });
  });

  it("sends only the configured admin deep-link payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 9 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createTelegramBotProvider(getTelegramConfig(env));
    await expect(provider.send({ text: "업체 승인 1건", adminPath: "/admin/ops" })).resolves.toEqual({ messageId: "9" });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.telegram.org/bot");
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({ chat_id: "-100123", text: "업체 승인 1건" });
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://example.com/admin/ops");
    expect(String(request.body)).not.toContain("TELEGRAM_WEBHOOK_SECRET");
  });
});
