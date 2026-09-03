import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { EmptyState } from "@/components/common/EmptyState";
import { PageIntro } from "@/components/common/PageIntro";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFilters } from "@/components/jobs/JobFilters";
import { Pagination } from "@/components/jobs/Pagination";
import {
  getJobPostList,
  getListPageSize,
  getMasterData,
} from "@/lib/jobs/dal";
import type { JobPostType } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "구인/운송 공고",
  alternates: { canonical: "/jobs" },
};

export default async function JobsPage(props: PageProps<"/jobs">) {
  const searchParams = await props.searchParams;

  const type: JobPostType | undefined =
    searchParams.type === "JOB" || searchParams.type === "TRANSPORT"
      ? searchParams.type
      : undefined;
  const regionId =
    typeof searchParams.region === "string" ? searchParams.region : undefined;
  const keyword =
    typeof searchParams.q === "string" ? searchParams.q : undefined;

  const rawPage =
    typeof searchParams.page === "string" ? Number(searchParams.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [masterData, result] = await Promise.all([
    getMasterData(),
    getJobPostList({ type, regionId, keyword, page }),
  ]);

  const pageSize = getListPageSize();
  const totalPages = Math.max(1, Math.ceil(result.totalCount / pageSize));
  const query = { type, region: regionId, q: keyword };

  return (
    <div className="min-h-screen bg-surface">
      <PageIntro eyebrow="JOBS & TRANSPORT" title="구인·운송 공고" description="지역, 차종과 톤수, 운행 형태와 급여 조건을 한눈에 비교하고 나에게 맞는 공고를 찾으세요." meta={<>현재 조건에 맞는 공개 공고 <strong className="text-primary">{result.totalCount.toLocaleString("ko-KR")}건</strong></>} />
      <Container className="space-y-7 py-8 sm:py-10">
        <JobFilters masterData={masterData} type={type} regionId={regionId} keyword={keyword} />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">공고 목록</h2>
          <p className="text-sm text-muted-foreground">최신 등록순</p>
        </div>
        {result.items.length === 0 ? (
          <EmptyState title="조건에 맞는 공고가 없습니다." description="지역이나 검색어 조건을 넓혀 다시 확인해 보세요." />
        ) : (
          <ul className="space-y-3.5">{result.items.map((post) => <li key={post.id}><JobCard post={post} /></li>)}</ul>
        )}
        <Pagination currentPage={page} totalPages={totalPages} query={query} />
      </Container>
    </div>
  );
}
