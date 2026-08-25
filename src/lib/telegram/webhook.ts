import { prisma } from "@/lib/prisma";
import { dispatchPendingOpsEvents, enqueueDailyOpsDigest } from "@/lib/ops/service";
import {
  authorizeTelegramActor,
  getTelegramActor,
  getTelegramConfig,
  parseTelegramUpdate,
  type TelegramConfig,
} from "./contract";
import { createTelegramBotProvider, type TelegramProvider } from "./provider";

export async function processTelegramWebhook(input: {
  payload: unknown;
  config?: TelegramConfig;
  provider?: TelegramProvider;
  now?: Date;
}) {
  const update = parseTelegramUpdate(input.payload);
  if (!update) throw new Error("TELEGRAM_UPDATE_INVALID");
  const config = input.config ?? getTelegramConfig();
  if (!authorizeTelegramActor(update, config)) throw new Error("TELEGRAM_ACTOR_UNAUTHORIZED");
  const actor = getTelegramActor(update);
  if (!actor) throw new Error("TELEGRAM_ACTOR_UNAUTHORIZED");
  const updateId = String(update.update_id);

  try {
    await prisma.telegramWebhookReceipt.create({
      data: { updateId, actorTelegramUserId: actor.userId, command: actor.command },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return { accepted: true, duplicate: true, command: actor.command };
    throw error;
  }

  const provider = input.provider ?? createTelegramBotProvider(config);
  if (actor.command?.toLowerCase().startsWith("/digest")) {
    await enqueueDailyOpsDigest(input.now);
    await dispatchPendingOpsEvents({ now: input.now, provider });
  } else {
    await provider.send({
      text: "지입몰 관리자 Bot\n/digest — 오늘 처리할 운영 업무 요약\n중요 상태 변경과 문의 답변은 관리자 페이지에서 최종 확인합니다.",
      adminPath: "/admin/ops",
    });
  }

  await prisma.telegramWebhookReceipt.update({ where: { updateId }, data: { processedAt: input.now ?? new Date() } });
  return { accepted: true, duplicate: false, command: actor.command };
}
