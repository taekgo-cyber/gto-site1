import { getTelegramConfig, type TelegramConfig } from "./contract";

export type TelegramMessage = {
  text: string;
  adminPath?: string;
};

export type TelegramSendResult = { messageId: string };

export interface TelegramProvider {
  send(message: TelegramMessage): Promise<TelegramSendResult>;
}

export function createTelegramBotProvider(config: TelegramConfig = getTelegramConfig()): TelegramProvider {
  return {
    async send(message) {
      const text = message.text.trim().slice(0, 3_500);
      if (!text) throw new Error("TELEGRAM_MESSAGE_INVALID");
      const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.adminChatId,
          text,
          disable_web_page_preview: true,
          ...(message.adminPath
            ? {
                reply_markup: {
                  inline_keyboard: [[{ text: "관리자에서 보기", url: `${config.siteUrl}${message.adminPath}` }]],
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`TELEGRAM_HTTP_${response.status}`);
      const payload = (await response.json()) as { ok?: boolean; result?: { message_id?: number } };
      if (!payload.ok || !Number.isSafeInteger(payload.result?.message_id)) throw new Error("TELEGRAM_PROVIDER_INVALID_RESPONSE");
      return { messageId: String(payload.result?.message_id) };
    },
  };
}
