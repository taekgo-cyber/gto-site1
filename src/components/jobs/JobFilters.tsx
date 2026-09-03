import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { MasterData } from "@/lib/jobs/dal";
import { jobPostTypeLabel } from "@/lib/jobs/labels";
import type { JobPostType } from "@/generated/prisma/enums";
import Link from "next/link";

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
      className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:gap-4 sm:p-5 lg:grid-cols-[1fr_1.35fr_2fr_auto_auto] lg:items-end"
    >
      <div>
        <label htmlFor="job-type" className="mb-1.5 block text-sm font-bold">공고 유형</label>
        <Select id="job-type" name="type" defaultValue={type ?? ""} aria-label="공고 유형">
          <option value="">전체 유형</option>
          <option value="JOB">{jobPostTypeLabel("JOB")}</option>
          <option value="TRANSPORT">{jobPostTypeLabel("TRANSPORT")}</option>
        </Select>
      </div>

      <div>
        <label htmlFor="job-region" className="mb-1.5 block text-sm font-bold">출발 지역</label>
        <Select id="job-region" name="region" defaultValue={regionId ?? ""} aria-label="출발 지역">
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

      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="job-keyword" className="mb-1.5 block text-sm font-bold">검색어</label>
        <Input
          id="job-keyword"
          name="q"
          type="search"
          aria-label="제목 또는 내용 검색"
          defaultValue={keyword ?? ""}
          placeholder="제목 또는 내용 검색"
        />
      </div>

      <Button type="submit" className="w-full lg:w-auto">조건 검색</Button>
      <Link href="/jobs" className="inline-flex min-h-12 items-center justify-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-surface hover:text-foreground">초기화</Link>
    </form>
  );
}
