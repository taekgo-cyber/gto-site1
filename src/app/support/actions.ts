"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/dal";
import { buildSupportAbuseKey, validateCreateSupportTicket } from "@/lib/support/contract";
import { createSupportTicket } from "@/lib/support/service";
import { logOperationalError } from "@/lib/observability/logger";

export type SupportFormState = { success?: boolean; statusUrl?: string; error?: string } | undefined;

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    SUPPORT_NAME_INVALID: "이름은 2~50자로 입력해 주세요.",
    SUPPORT_CONTACT_REQUIRED: "답변을 확인할 이메일 또는 전화번호가 필요합니다.",
    SUPPORT_EMAIL_INVALID: "이메일 형식을 확인해 주세요.",
    SUPPORT_PHONE_INVALID: "전화번호 형식을 확인해 주세요.",
    SUPPORT_CATEGORY_INVALID: "문의 유형을 선택해 주세요.",
    SUPPORT_SUBJECT_INVALID: "제목은 3~120자로 입력해 주세요.",
    SUPPORT_MESSAGE_INVALID: "문의 내용은 10~4,000자로 입력해 주세요.",
    SUPPORT_RATE_LIMITED: "요청이 너무 많습니다. 한 시간 뒤 다시 시도해 주세요.",
    SUPPORT_ABUSE_PROTECTION_NOT_CONFIGURED: "문의 보호 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
  };
  return messages[code] ?? "문의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function createSupportTicketAction(
  _previous: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  if (value(formData, "website")) return { success: true, statusUrl: "/support" };
  const data = {
    requesterName: value(formData, "requesterName"),
    requesterEmail: value(formData, "requesterEmail"),
    requesterPhone: value(formData, "requesterPhone"),
    category: value(formData, "category"),
    subject: value(formData, "subject"),
    message: value(formData, "message"),
    priority: value(formData, "priority"),
  };
  try {
    const validated = validateCreateSupportTicket(data);
    const requestHeaders = await headers();
    const address = (requestHeaders.get("x-real-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? "anonymous").trim().slice(0, 128);
    const dedicatedSecret = process.env.SUPPORT_ABUSE_HASH_SECRET ?? "";
    const secret = process.env.NODE_ENV === "production"
      ? dedicatedSecret
      : dedicatedSecret || process.env.AUTH_SECRET || "";
    const abuse = buildSupportAbuseKey({ address, contact: validated.requesterEmail || validated.requesterPhone || "", secret });
    const user = await getCurrentUser();
    const ticket = await createSupportTicket({ requesterUserId: user?.id, data, abuse });
    return { success: true, statusUrl: `/support/tickets/${ticket.accessToken}` };
  } catch (error) {
    logOperationalError({
      operation: "support_ticket_create",
      actorType: "ANONYMOUS",
      category: error instanceof Error && error.message.startsWith("SUPPORT_") ? "VALIDATION" : "UNEXPECTED",
      error,
      identifiers: { route: "/support" },
    });
    return { error: errorMessage(error) };
  }
}
