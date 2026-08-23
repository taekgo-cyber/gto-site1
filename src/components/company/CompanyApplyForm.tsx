"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  applyCompanyAction,
  resubmitCompanyAction,
  updateCompanyAction,
  type CompanyActionState,
} from "@/app/company/apply/actions";

type CompanyDraft = {
  id?: string;
  name?: string;
  businessNumber?: string;
  representativeName?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  regionId?: string | null;
  introduction?: string | null;
  status?: string;
};

function ActionMessage({ state }: { state: CompanyActionState | undefined }) {
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

function CompanyFields({ draft }: { draft: CompanyDraft | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="name">업체명 *</Label>
        <Input id="name" name="name" required maxLength={100} defaultValue={draft?.name ?? ""} placeholder="예: 테스트 운송 주식회사" />
      </div>
      <div>
        <Label htmlFor="businessNumber">사업자등록번호 *</Label>
        <Input id="businessNumber" name="businessNumber" required placeholder="예: 220-81-62517" defaultValue={draft?.businessNumber ?? ""} />
        <p className="mt-1 text-xs text-muted-foreground">하이픈 포함 10자리. 검증 후 중복 불가.</p>
      </div>
      <div>
        <Label htmlFor="representativeName">대표자명 *</Label>
        <Input id="representativeName" name="representativeName" required maxLength={50} defaultValue={draft?.representativeName ?? ""} />
      </div>
      <div>
        <Label htmlFor="phone">전화번호</Label>
        <Input id="phone" name="phone" maxLength={30} defaultValue={draft?.phone ?? ""} placeholder="예: 02-1234-5678" />
      </div>
      <div>
        <Label htmlFor="email">이메일</Label>
        <Input id="email" name="email" type="email" maxLength={254} defaultValue={draft?.email ?? ""} placeholder="예: contact@example.com" />
      </div>
      <div>
        <Label htmlFor="address">주소</Label>
        <Input id="address" name="address" maxLength={200} defaultValue={draft?.address ?? ""} />
      </div>
      <div>
        <Label htmlFor="addressDetail">상세주소</Label>
        <Input id="addressDetail" name="addressDetail" maxLength={200} defaultValue={draft?.addressDetail ?? ""} />
      </div>
      <div>
        <Label htmlFor="regionId">지역 ID (선택)</Label>
        <Input id="regionId" name="regionId" defaultValue={draft?.regionId ?? ""} placeholder="선택 시 Region ID 입력" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="introduction">소개</Label>
        <textarea
          id="introduction"
          name="introduction"
          maxLength={2000}
          rows={4}
          defaultValue={draft?.introduction ?? ""}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          placeholder="업체 소개를 입력해 주세요. (최대 2000자)"
        />
      </div>
    </div>
  );
}

export function CompanyNewForm() {
  const [state, action, pending] = useActionState(applyCompanyAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {/* actorUserId field is intentionally ignored server-side — test coverage proves server actor binding */}
      <input type="hidden" name="actorUserId" value="client-should-be-ignored" />
      <CompanyFields draft={null} />
      <ActionMessage state={state} />
      <Button type="submit" disabled={pending}>{pending ? "신청 중..." : "업체 등록 신청"}</Button>
    </form>
  );
}

export function CompanyEditForm({ company }: { company: CompanyDraft & { id: string; status: string } }) {
  const [updateState, updateAction, updatePending] = useActionState(updateCompanyAction, undefined);
  const [resubmitState, resubmitAction, resubmitPending] = useActionState(resubmitCompanyAction, undefined);
  const isPending = company.status === "PENDING";
  const isRejected = company.status === "REJECTED";

  return (
    <div className="space-y-6">
      <div className={`rounded-md border px-3 py-2 text-sm ${isPending ? "border-amber-200 bg-amber-50 text-amber-800" : isRejected ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-surface text-foreground"}`}>
        <span className="font-medium">현재 상태: {company.status}</span>
        {isPending ? <span className="ml-2">승인 심사 중입니다. 기본 정보는 수정할 수 있습니다.</span> : null}
        {isRejected ? <span className="ml-2">반려되었습니다. 정보를 수정한 뒤 재신청할 수 있습니다.</span> : null}
      </div>

      <form action={updateAction} className="space-y-4">
        <input type="hidden" name="companyId" value={company.id} />
        <CompanyFields draft={company} />
        <ActionMessage state={updateState} />
        <Button type="submit" variant="outline" disabled={updatePending}>{updatePending ? "수정 중..." : "기본 정보 수정"}</Button>
      </form>

      {isRejected ? (
        <form action={resubmitAction} className="space-y-3 rounded-md border border-primary/30 bg-surface p-4">
          <input type="hidden" name="companyId" value={company.id} />
          {/* Allow inline edits on resubmit — will be forwarded as optional patch */}
          <p className="text-sm font-medium">재신청</p>
          <p className="text-sm text-muted-foreground">필요 시 위 필드를 수정한 뒤 재신청 버튼을 눌러 주세요. 변경 없이도 재신청할 수 있습니다.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="resubmit-name">업체명 (재신청 시 수정)</Label>
              <Input id="resubmit-name" name="name" defaultValue={company.name ?? ""} />
            </div>
            <div>
              <Label htmlFor="resubmit-representativeName">대표자명 (재신청 시 수정)</Label>
              <Input id="resubmit-representativeName" name="representativeName" defaultValue={company.representativeName ?? ""} />
            </div>
          </div>
          <ActionMessage state={resubmitState} />
          <Button type="submit" disabled={resubmitPending}>{resubmitPending ? "재신청 중..." : "재신청하기"}</Button>
        </form>
      ) : null}
    </div>
  );
}
