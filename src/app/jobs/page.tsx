import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
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
    <Container className="space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">구인/운송 공고</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          총 {result.totalCount}건의 공고가 있습니다.
        </p>
      </div>

      <JobFilters masterData={masterData} type={type} regionId={regionId} keyword={keyword} />

      {result.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          조건에 맞는 공고가 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {result.items.map((post) => (
            <li key={post.id}>
              <JobCard post={post} />
            </li>
          ))}
        </ul>
      )}

      <Pagination currentPage={page} totalPages={totalPages} query={query} />
    </Container>
  );
}
