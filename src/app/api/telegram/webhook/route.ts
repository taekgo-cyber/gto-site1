import { verifyTelegramWebhookSecret } from "@/lib/telegram/contract";
import { processTelegramWebhook } from "@/lib/telegram/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!verifyTelegramWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await processTelegramWebhook({ payload });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_WEBHOOK_FAILED";
    if (code === "TELEGRAM_ACTOR_UNAUTHORIZED") {
      return Response.json({ error: code }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "TELEGRAM_UPDATE_INVALID") {
      return Response.json({ error: code }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "TELEGRAM_WEBHOOK_FAILED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
