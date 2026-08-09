import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { MasterData } from "@/lib/jobs/dal";
import { jobPostTypeLabel } from "@/lib/jobs/labels";
import type { JobPostType } from "@/generated/prisma/enums";

type JobFiltersProps = {
  masterData: MasterData;
  type?: JobPostType;
  regionId?: string;
  keyword?: string;
};

export function JobFilters({
  masterData,
  type,
  regionId,
  keyword,
}: JobFiltersProps) {
  return (
    <form
      action="/jobs"
      method="get"
      className="flex flex-wrap items-end gap-2"
    >
      <div className="min-w-32">
        <Select name="type" defaultValue={type ?? ""} aria-label="공고 유형">
          <option value="">전체 유형</option>
          <option value="JOB">{jobPostTypeLabel("JOB")}</option>
          <option value="TRANSPORT">{jobPostTypeLabel("TRANSPORT")}</option>
        </Select>
      </div>

      <div className="min-w-40">
        <Select name="region" defaultValue={regionId ?? ""} aria-label="출발 지역">
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
      </div>

      <div className="min-w-52">
        <Input
          name="q"
          type="search"
          defaultValue={keyword ?? ""}
          placeholder="제목 또는 내용 검색"
        />
      </div>

      <Button type="submit">검색</Button>
    </form>
  );
}
