"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_TICKET_CATEGORIES } from "@/lib/support/contract";
import { createSupportTicketAction, type SupportFormState } from "./actions";

const inputClass = "min-h-12 w-full rounded-lg border border-border bg-background px-3.5 text-base shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1";

export function SupportForm({
  defaults,
}: {
  defaults: { name?: string; email?: string; phone?: string; category?: string; subject?: string; message?: string };
}) {
  const [state, action, pending] = useActionState<SupportFormState, FormData>(createSupportTicketAction, undefined);
  if (state?.success && state.statusUrl && state.statusUrl !== "/support") {
    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-5" role="status">
        <h2 className="text-lg font-bold text-green-900">문의가 접수되었습니다.</h2>
        <p className="text-sm text-green-800">아래 전용 링크에서 처리 상태와 관리자 답변을 확인할 수 있습니다. 링크를 안전하게 보관해 주세요.</p>
        <Link href={state.statusUrl}><Button>문의 상태 확인</Button></Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <div className="hidden" aria-hidden="true"><label>웹사이트<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {state?.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">이름<span aria-hidden="true"> *</span><input name="requesterName" required minLength={2} maxLength={50} defaultValue={defaults.name} className={inputClass} autoComplete="name" /></label>
        <label className="space-y-1 text-sm font-medium">문의 유형<span aria-hidden="true"> *</span><select name="category" required defaultValue={SUPPORT_TICKET_CATEGORIES.includes(defaults.category as never) ? defaults.category : "OTHER"} className={inputClass}>{SUPPORT_TICKET_CATEGORIES.map((category) => <option key={category} value={category}>{SUPPORT_CATEGORY_LABELS[category]}</option>)}</select></label>
        <label className="space-y-1 text-sm font-medium">이메일<input name="requesterEmail" type="email" maxLength={254} defaultValue={defaults.email} className={inputClass} autoComplete="email" /></label>
        <label className="space-y-1 text-sm font-medium">전화번호<input name="requesterPhone" type="tel" maxLength={30} defaultValue={defaults.phone} className={inputClass} autoComplete="tel" /></label>
      </div>
      <p className="rounded-lg bg-surface px-3.5 py-3 text-sm leading-6 text-muted-foreground">이메일 또는 전화번호 중 하나는 필수입니다. 연락처는 문의 처리에만 사용하며 Telegram 알림에는 포함하지 않습니다.</p>
      <label className="block space-y-1 text-sm font-medium">제목<span aria-hidden="true"> *</span><input name="subject" required minLength={3} maxLength={120} defaultValue={defaults.subject} className={inputClass} /></label>
      <label className="block space-y-1 text-sm font-medium">문의 내용<span aria-hidden="true"> *</span><textarea name="message" required minLength={10} maxLength={4000} rows={8} defaultValue={defaults.message} className={`${inputClass} py-3`} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="priority" value="URGENT" /> 운행·계정 차단 등 긴급 확인이 필요합니다.</label>
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">{pending ? "접수 중..." : "문의 접수"}</Button>
    </form>
  );
}
