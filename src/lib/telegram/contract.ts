import { timingSafeEqual } from "node:crypto";

export type TelegramConfig = {
  botToken: string;
  adminChatId: string;
  adminUserIds: ReadonlySet<string>;
  webhookSecret: string;
  siteUrl: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number } };
  };
};

function safeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function getTelegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const adminChatId = env.TELEGRAM_ADMIN_CHAT_ID?.trim() ?? "";
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const adminUserIds = new Set(
    (env.TELEGRAM_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value)),
  );

  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)) throw new Error("TELEGRAM_NOT_CONFIGURED");
  if (!/^-?\d+$/.test(adminChatId)) throw new Error("TELEGRAM_NOT_CONFIGURED");
  if (adminUserIds.size === 0) throw new Error("TELEGRAM_NOT_CONFIGURED");
  if (webhookSecret.length < 32) throw new Error("TELEGRAM_NOT_CONFIGURED");
  if (!/^https?:\/\//.test(siteUrl)) throw new Error("TELEGRAM_NOT_CONFIGURED");
  if (env.NODE_ENV === "production" && !siteUrl.startsWith("https://")) throw new Error("TELEGRAM_NOT_CONFIGURED");

  return { botToken, adminChatId, adminUserIds, webhookSecret, siteUrl };
}

export function verifyTelegramWebhookSecret(supplied: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  return expected.length >= 32 && safeEqual(supplied ?? "", expected);
}

export function getTelegramActor(update: TelegramUpdate): { userId: string; chatId: string; command: string | null } | null {
  const message = update.message;
  const callback = update.callback_query;
  const userId = message?.from?.id ?? callback?.from?.id;
  const chatId = message?.chat?.id ?? callback?.message?.chat?.id;
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(chatId)) return null;
  const raw = message?.text ?? callback?.data ?? "";
  const command = raw.trim().slice(0, 120) || null;
  return { userId: String(userId), chatId: String(chatId), command };
}

export function authorizeTelegramActor(update: TelegramUpdate, config: TelegramConfig): boolean {
  const actor = getTelegramActor(update);
  return Boolean(actor && actor.chatId === config.adminChatId && config.adminUserIds.has(actor.userId));
}

export function parseTelegramUpdate(value: unknown): TelegramUpdate | null {
  if (!value || typeof value !== "object") return null;
  const update = value as TelegramUpdate;
  if (!Number.isSafeInteger(update.update_id)) return null;
  return update;
}
