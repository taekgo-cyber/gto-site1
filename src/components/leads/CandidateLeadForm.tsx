"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import {
  activateCandidateLeadAction,
  saveCandidateLead,
  updateCandidateLeadStatus,
  type LeadActionState,
} from "@/lib/leads/actions";

type Option = { id: string; name: string };

export type CandidateLeadFormValue = {
  id?: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED" | "EXPIRED";
  preferredRegionId: string | null;
  vehicleTypeId: string | null;
  tonnageId: string | null;
  experienceYears: number | null;
  leaseExperience: boolean | null;
  vehicleOwned: boolean | null;
  licenseInfo: string | null;
  desiredWorkType: string | null;
  desiredIncomeMin: number | null;
  desiredIncomeMax: number | null;
  availableFrom: string | null;
  careerSummary: string | null;
  expiresAt: string | null;
};

function ActionMessage({ state }: { state: LeadActionState | undefined }) {
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

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function CandidateLeadForm({
  lead,
  regions,
  vehicleTypes,
  tonnages,
}: {
  lead: CandidateLeadFormValue | null;
  regions: Option[];
  vehicleTypes: Option[];
  tonnages: Option[];
}) {
  const [saveState, saveAction, savePending] = useActionState(saveCandidateLead, undefined);
  const [activateState, activateAction, activatePending] = useActionState(activateCandidateLeadAction, undefined);
  const [statusState, statusAction, statusPending] = useActionState(updateCandidateLeadStatus, undefined);
  const terminal = lead?.status === "CLOSED" || lead?.status === "EXPIRED";
  const disabled = terminal;
  const id = lead?.id ?? "";

  return (
    <div className="space-y-5">
      <form action={saveAction} className="space-y-5">
        <input type="hidden" name="leadId" value={id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="preferredRegionId">희망 지역</Label>
            <Select id="preferredRegionId" name="preferredRegionId" defaultValue={lead?.preferredRegionId ?? ""} disabled={disabled}>
              <option value="">선택해 주세요</option>
              {regions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="desiredWorkType">희망 근무 형태</Label>
            <Select id="desiredWorkType" name="desiredWorkType" defaultValue={lead?.desiredWorkType ?? ""} disabled={disabled}>
              <option value="">선택해 주세요</option>
              <option value="FULL_TIME">전일제</option>
              <option value="PART_TIME">파트타임</option>
              <option value="CONTRACT">계약직</option>
              <option value="DAILY">일용직</option>
              <option value="FREELANCE">프리랜서</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="vehicleTypeId">희망 차종</Label>
            <Select id="vehicleTypeId" name="vehicleTypeId" defaultValue={lead?.vehicleTypeId ?? ""} disabled={disabled}>
              <option value="">선택해 주세요</option>
              {vehicleTypes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tonnageId">희망 톤수</Label>
            <Select id="tonnageId" name="tonnageId" defaultValue={lead?.tonnageId ?? ""} disabled={disabled}>
              <option value="">선택해 주세요</option>
              {tonnages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="experienceYears">운전/화물 경력(년)</Label>
            <Input id="experienceYears" name="experienceYears" type="number" min="0" max="60" defaultValue={lead?.experienceYears ?? ""} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="licenseInfo">면허/자격 정보</Label>
            <Input id="licenseInfo" name="licenseInfo" maxLength={500} defaultValue={lead?.licenseInfo ?? ""} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="desiredIncomeMin">희망 수입 최소(원)</Label>
            <Input id="desiredIncomeMin" name="desiredIncomeMin" type="number" min="0" defaultValue={lead?.desiredIncomeMin ?? ""} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="desiredIncomeMax">희망 수입 최대(원)</Label>
            <Input id="desiredIncomeMax" name="desiredIncomeMax" type="number" min="0" defaultValue={lead?.desiredIncomeMax ?? ""} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="availableFrom">근무 가능일</Label>
            <Input id="availableFrom" name="availableFrom" type="date" defaultValue={dateInputValue(lead?.availableFrom ?? null)} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="expiresAt">공개 종료일(선택)</Label>
            <Input id="expiresAt" name="expiresAt" type="date" defaultValue={dateInputValue(lead?.expiresAt ?? null)} disabled={disabled} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="leaseExperience" value="on" defaultChecked={lead?.leaseExperience === true} disabled={disabled} />
            지입 경험 있음
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="vehicleOwned" value="on" defaultChecked={lead?.vehicleOwned === true} disabled={disabled} />
            차량 보유
          </label>
        </div>

        <div>
          <Label htmlFor="careerSummary">경력 요약</Label>
          <textarea
            id="careerSummary"
            name="careerSummary"
            maxLength={5000}
            rows={6}
            defaultValue={lead?.careerSummary ?? ""}
            disabled={disabled}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="운송 경력과 희망 업무를 적어 주세요. 이름, 전화번호, 이메일 등 연락처는 적지 말아 주세요."
          />
          <p className="mt-1 text-xs text-muted-foreground">최대 5,000자. 연락처는 회원 프로필에서 안전하게 관리됩니다.</p>
        </div>

        <ActionMessage state={saveState} />
        {!terminal ? (
          <Button type="submit" variant="outline" disabled={savePending || activatePending}>
            {savePending ? "저장 중..." : "임시 저장"}
          </Button>
        ) : null}
      </form>

      {!terminal && lead?.status === "DRAFT" ? (
        <form action={activateAction} className="space-y-3 rounded-md border border-primary/30 bg-surface p-4">
          <input type="hidden" name="leadId" value={id} />
          <p className="text-sm font-medium">기업에 구직정보 공개</p>
          <p className="text-sm text-muted-foreground">공개하면 조건에 맞는 기업이 매칭 후보로 확인할 수 있습니다. 실제 연락처는 별도 unlock 전까지 공개되지 않습니다.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" value="on" required />
            <span>기업의 구직 매칭 및 향후 연락을 위한 개인정보 이용·제공에 동의합니다. (정책 v1)</span>
          </label>
          <ActionMessage state={activateState} />
          <Button type="submit" disabled={activatePending || savePending}>
            {activatePending ? "공개 처리 중..." : "구직정보 공개"}
          </Button>
        </form>
      ) : null}

      {!terminal && lead && (lead.status === "ACTIVE" || lead.status === "PAUSED") ? (
        <div className="space-y-3 border-t border-border pt-4">
          <ActionMessage state={statusState} />
          <div className="flex flex-wrap gap-2">
            <form action={statusAction}>
              <input type="hidden" name="leadId" value={id} />
              <input type="hidden" name="intent" value={lead.status === "ACTIVE" ? "pause" : "resume"} />
              <Button type="submit" variant="outline" disabled={statusPending}>
                {lead.status === "ACTIVE" ? "일시중지" : "다시 공개"}
              </Button>
            </form>
            <form action={statusAction}>
              <input type="hidden" name="leadId" value={id} />
              <input type="hidden" name="intent" value="close" />
              <Button type="submit" variant="ghost" disabled={statusPending} className="text-red-600 hover:bg-red-50">
                구직정보 종료
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
