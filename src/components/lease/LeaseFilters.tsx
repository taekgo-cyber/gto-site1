import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { PayType, LeasePostType } from "@/generated/prisma/enums";
import type { LeaseMasterData } from "@/lib/lease/dal";
import { PAY_TYPE_OPTIONS } from "@/lib/lease/options";
import { leasePostTypeLabel } from "@/lib/posts/labels";
import Link from "next/link";

type LeaseFiltersProps = {
  masterData: LeaseMasterData;
  type?: LeasePostType;
  regionId?: string;
  vehicleTypeId?: string;
  tonnageId?: string;
  payType?: PayType;
  keyword?: string;
};

export function LeaseFilters({
  masterData,
  type,
  regionId,
  vehicleTypeId,
  tonnageId,
  payType,
  keyword,
}: LeaseFiltersProps) {
  return (
    <form
      action="/lease"
      method="get"
      className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:gap-4 sm:p-5 lg:grid-cols-3 xl:grid-cols-6 xl:items-end"
    >
      <div><label htmlFor="lease-type" className="mb-1.5 block text-sm font-bold">유형</label><Select id="lease-type" name="type" defaultValue={type ?? ""} aria-label="게시글 유형">
        <option value="">전체 유형</option>
        <option value="HIRE">{leasePostTypeLabel("HIRE")}</option>
        <option value="SEEK">{leasePostTypeLabel("SEEK")}</option>
      </Select></div>

      <div><label htmlFor="lease-region" className="mb-1.5 block text-sm font-bold">지역</label><Select id="lease-region" name="regionId" defaultValue={regionId ?? ""} aria-label="지역">
        <option value="">전체 지역</option>
        {masterData.regions.map((province) => (
          <optgroup key={province.id} label={province.name}>
            <option value={province.id}>{province.name} 전체</option>
            {province.children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select></div>

      <div><label htmlFor="lease-vehicle" className="mb-1.5 block text-sm font-bold">차종</label><Select
        id="lease-vehicle"
        name="vehicleTypeId"
        defaultValue={vehicleTypeId ?? ""}
        aria-label="차종"
      >
        <option value="">전체 차종</option>
        {masterData.vehicleTypes.map((vehicleType) => (
          <option key={vehicleType.id} value={vehicleType.id}>
            {vehicleType.name}
          </option>
        ))}
      </Select></div>

      <div><label htmlFor="lease-tonnage" className="mb-1.5 block text-sm font-bold">톤수</label><Select id="lease-tonnage" name="tonnageId" defaultValue={tonnageId ?? ""} aria-label="톤수">
        <option value="">전체 톤수</option>
        {masterData.tonnages.map((tonnage) => (
          <option key={tonnage.id} value={tonnage.id}>
            {tonnage.name}
          </option>
        ))}
      </Select></div>

      <div><label htmlFor="lease-pay" className="mb-1.5 block text-sm font-bold">급여</label><Select id="lease-pay" name="payType" defaultValue={payType ?? ""} aria-label="급여 유형">
        <option value="">전체 급여</option>
        {PAY_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select></div>

      <div className="col-span-2 lg:col-span-1"><label htmlFor="lease-keyword" className="mb-1.5 block text-sm font-bold">검색어</label><div className="flex items-center gap-2">
        <Input
          id="lease-keyword"
          name="keyword"
          type="search"
          defaultValue={keyword ?? ""}
          placeholder="제목 또는 내용 검색"
          aria-label="검색어"
        />
        <Button type="submit" className="shrink-0">
          검색
        </Button>
      </div></div>
      <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6 xl:flex xl:justify-end"><Link href="/lease" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-surface hover:text-foreground">조건 초기화</Link></div>
    </form>
  );
}
