import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { PayType, LeasePostType } from "@/generated/prisma/enums";
import type { LeaseMasterData } from "@/lib/lease/dal";
import { PAY_TYPE_OPTIONS } from "@/lib/lease/options";
import { leasePostTypeLabel } from "@/lib/posts/labels";

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
      className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Select name="type" defaultValue={type ?? ""} aria-label="게시글 유형">
        <option value="">전체 유형</option>
        <option value="HIRE">{leasePostTypeLabel("HIRE")}</option>
        <option value="SEEK">{leasePostTypeLabel("SEEK")}</option>
      </Select>

      <Select name="regionId" defaultValue={regionId ?? ""} aria-label="지역">
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
      </Select>

      <Select
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
      </Select>

      <Select name="tonnageId" defaultValue={tonnageId ?? ""} aria-label="톤수">
        <option value="">전체 톤수</option>
        {masterData.tonnages.map((tonnage) => (
          <option key={tonnage.id} value={tonnage.id}>
            {tonnage.name}
          </option>
        ))}
      </Select>

      <Select name="payType" defaultValue={payType ?? ""} aria-label="급여 유형">
        <option value="">전체 급여</option>
        {PAY_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <div className="flex items-center gap-2">
        <Input
          name="keyword"
          type="search"
          defaultValue={keyword ?? ""}
          placeholder="제목 또는 내용 검색"
          aria-label="검색어"
        />
        <Button type="submit" className="shrink-0">
          검색
        </Button>
      </div>
    </form>
  );
}
