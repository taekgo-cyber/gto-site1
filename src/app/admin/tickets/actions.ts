"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { replyToSupportTicket, setSupportTicketStatus } from "@/lib/support/service";

export type AdminTicketActionState = { success?: boolean; message?: string; error?: string } | undefined;

function field(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function toMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: "관리자 권한이 필요합니다.",
    SUPPORT_TICKET_NOT_FOUND: "문의를 찾을 수 없습니다.",
    SUPPORT_TICKET_CLOSED: "종료된 문의에는 답변할 수 없습니다.",
    SUPPORT_REPLY_INVALID: "답변은 2~4,000자로 입력해 주세요.",
    SUPPORT_STATUS_INVALID: "지원하지 않는 문의 상태입니다.",
    SUPPORT_STATUS_REASON_INVALID: "상태 변경 사유는 2~500자로 입력해 주세요.",
  };
  return messages[code] ?? "요청을 처리하지 못했습니다.";
}

export async function replyToTicketAction(_previous: AdminTicketActionState, formData: FormData): Promise<AdminTicketActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const ticketId = field(formData, "ticketId");
  try {
    await replyToSupportTicket({ adminUserId: user.id, ticketId, message: field(formData, "message"), resolve: field(formData, "resolve") === "true" });
    revalidatePath("/admin/tickets");
    revalidatePath(`/admin/tickets/${ticketId}`);
    return { success: true, message: field(formData, "resolve") === "true" ? "답변을 저장하고 처리 완료했습니다." : "답변을 저장했습니다. 고객은 웹 상태 페이지에서 즉시 확인할 수 있습니다." };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export async function setTicketStatusAction(_previous: AdminTicketActionState, formData: FormData): Promise<AdminTicketActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const ticketId = field(formData, "ticketId");
  try {
    await setSupportTicketStatus({ adminUserId: user.id, ticketId, status: field(formData, "status"), reason: field(formData, "reason") });
    revalidatePath("/admin/tickets");
    revalidatePath(`/admin/tickets/${ticketId}`);
    return { success: true, message: "문의 상태를 변경했습니다." };
  } catch (error) {
    return { error: toMessage(error) };
  }
}
