import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { LeaseCard } from "@/components/lease/LeaseCard";
import { LeaseFilters } from "@/components/lease/LeaseFilters";
import { Pagination } from "@/components/jobs/Pagination";
import { getLeaseMasterData } from "@/lib/lease/dal";
import { parseLeaseListParams } from "@/lib/lease/query";
import { getPostList } from "@/lib/posts/dal";
import { DEFAULT_PAGE_SIZE } from "@/lib/posts/validation";

export const metadata: Metadata = {
  title: "지입 구인/구직",
};

export default async function LeasePage(props: PageProps<"/lease">) {
  const searchParams = await props.searchParams;
  const query = parseLeaseListParams(searchParams);

  const [masterData, result] = await Promise.all([
    getLeaseMasterData(),
    getPostList({ ...query, pageSize: DEFAULT_PAGE_SIZE }),
  ]);

  const paginationQuery: Record<string, string | undefined> = {
    type: query.type,
    regionId: query.regionId,
    vehicleTypeId: query.vehicleTypeId,
    tonnageId: query.tonnageId,
    payType: query.payType,
    keyword: query.keyword,
  };

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">지입 구인/구직</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            총 {result.totalCount}건의 게시글이 있습니다.
          </p>
        </div>
        <Link href="/lease/write">
          <Button>글쓰기</Button>
        </Link>
      </div>

      <LeaseFilters
        masterData={masterData}
        type={query.type}
        regionId={query.regionId}
        vehicleTypeId={query.vehicleTypeId}
        tonnageId={query.tonnageId}
        payType={query.payType}
        keyword={query.keyword}
      />

      {result.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          등록된 지입 구인/구직 게시글이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {result.items.map((post) => (
            <li key={post.id}>
              <LeaseCard post={post} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        query={paginationQuery}
        basePath="/lease"
      />
    </Container>
  );
}
