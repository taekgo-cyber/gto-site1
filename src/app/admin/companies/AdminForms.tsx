"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { approveCompanyAction, changeCompanyStatusAction, rejectCompanyAction, type AdminCompanyActionState } from "./actions";

function ActionMessage({ state }: { state: AdminCompanyActionState | undefined }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${state.error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function ApproveForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(approveCompanyAction, undefined);
  return (
    <form action={action} className="space-y-3 rounded-md border border-green-200 bg-green-50/50 p-4">
      <input type="hidden" name="companyId" value={companyId} />
      <h3 className="text-sm font-semibold text-green-800">승인</h3>
      <p className="text-xs text-muted-foreground">PENDING → ACTIVE로 전환하고 OWNER를 COMPANY로 승격합니다. (이미 ACTIVE면 idempotent)</p>
      <ActionMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "승인 중..." : "승인하기"}
      </Button>
    </form>
  );
}

export function RejectForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(rejectCompanyAction, undefined);
  return (
    <form action={action} className="space-y-3 rounded-md border border-red-200 bg-red-50/50 p-4">
      <input type="hidden" name="companyId" value={companyId} />
      <h3 className="text-sm font-semibold text-red-800">반려</h3>
      <p className="text-xs text-muted-foreground">PENDING → REJECTED로 전환합니다. User.role은 유지됩니다.</p>
      <div>
        <Label htmlFor={`reason-${companyId}`}>반려 사유 (선택, 최대 500자)</Label>
        <textarea
          id={`reason-${companyId}`}
          name="reason"
          maxLength={500}
          rows={3}
          placeholder="선택 사항 — 미입력 시 사유 없이 반려됩니다."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </div>
      <ActionMessage state={state} />
      <Button type="submit" variant="outline" disabled={pending} className="border-red-200 text-red-700 hover:bg-red-50">
        {pending ? "반려 중..." : "반려하기"}
      </Button>
    </form>
  );
}

export function CompanyStatusForm({ companyId, status }: { companyId: string; status: "ACTIVE" | "SUSPENDED" }) {
  const [state, action, pending] = useActionState(changeCompanyStatusAction, undefined);
  const nextStatus = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return (
    <form action={action} className="space-y-3 rounded-md border border-border bg-surface p-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="status" value={nextStatus} />
      <h3 className="text-sm font-semibold">{status === "ACTIVE" ? "운영 일시정지" : "운영 재활성화"}</h3>
      <p className="text-xs text-muted-foreground">{status} → {nextStatus}. 관련 업체 권한은 서버에서 즉시 다시 검증됩니다.</p>
      <div>
        <Label htmlFor={`status-reason-${companyId}`}>변경 사유 (필수)</Label>
        <textarea id={`status-reason-${companyId}`} name="reason" required minLength={2} maxLength={500} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <ActionMessage state={state} />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "처리 중..." : nextStatus === "ACTIVE" ? "재활성화" : "일시정지"}</Button>
    </form>
  );
}
