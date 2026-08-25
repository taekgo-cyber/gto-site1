"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SUPPORT_STATUS_LABELS, SUPPORT_TICKET_STATUSES, type SupportTicketStatusValue } from "@/lib/support/contract";
import { replyToTicketAction, setTicketStatusAction, type AdminTicketActionState } from "./actions";

const inputClass = "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:text-sm";

function Message({ state }: { state: AdminTicketActionState }) {
  if (!state?.error && !state?.message) return null;
  return <p role={state.error ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${state.error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{state.error ?? state.message}</p>;
}

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(replyToTicketAction, undefined);
  return <form action={action} className="space-y-3"><input type="hidden" name="ticketId" value={ticketId} /><Message state={state} /><label className="block space-y-1 text-sm font-medium">고객 답변<textarea name="message" required minLength={2} maxLength={4000} rows={7} className={`${inputClass} py-3`} placeholder="개인정보나 내부 메모를 포함하지 마세요." /></label><div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" name="resolve" value="false" disabled={pending}>답변 저장</Button><Button type="submit" name="resolve" value="true" variant="outline" disabled={pending}>답변 후 처리 완료</Button></div><p className="text-xs text-muted-foreground">S22에서는 웹 상태 페이지 전달이 기본입니다. 이메일 provider 연결 전에도 답변 기록은 보존됩니다.</p></form>;
}

export function StatusForm({ ticketId, status }: { ticketId: string; status: SupportTicketStatusValue }) {
  const [state, action, pending] = useActionState(setTicketStatusAction, undefined);
  return <form action={action} className="space-y-3"><input type="hidden" name="ticketId" value={ticketId} /><Message state={state} /><label className="block space-y-1 text-sm font-medium">상태<select name="status" defaultValue={status} className={inputClass}>{SUPPORT_TICKET_STATUSES.map((value) => <option key={value} value={value}>{SUPPORT_STATUS_LABELS[value]}</option>)}</select></label><label className="block space-y-1 text-sm font-medium">변경 사유<input name="reason" required minLength={2} maxLength={500} className={inputClass} placeholder="예: 고객 추가 정보 대기" /></label><Button type="submit" variant="outline" disabled={pending}>{pending ? "변경 중..." : "상태 변경"}</Button></form>;
}
