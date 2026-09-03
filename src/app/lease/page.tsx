import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { EmptyState } from "@/components/common/EmptyState";
import { PageIntro } from "@/components/common/PageIntro";
import { LeaseCard } from "@/components/lease/LeaseCard";
import { LeaseFilters } from "@/components/lease/LeaseFilters";
import { Pagination } from "@/components/jobs/Pagination";
import { getLeaseMasterData } from "@/lib/lease/dal";
import { parseLeaseListParams } from "@/lib/lease/query";
import { getPostList } from "@/lib/posts/dal";
import { DEFAULT_PAGE_SIZE } from "@/lib/posts/validation";
import { shouldNoindexLeaseList } from "@/lib/seo/noindex";

export async function generateMetadata(
  props: PageProps<"/lease">,
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const noindex = shouldNoindexLeaseList(searchParams);

  if (noindex) {
    return { title: "지입 구인/구직", robots: { index: false, follow: true } };
  }
  return { title: "지입 구인/구직", alternates: { canonical: "/lease" } };
}

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
    <div className="min-h-screen bg-surface">
      <PageIntro eyebrow="LEASE & VEHICLES" title="지입·차량 정보" description="차량, 지역, 톤수와 수익 조건을 빠르게 비교하고 지입 구인·구직 정보를 확인하세요." meta={<>현재 공개된 지입 정보 <strong className="text-primary">{result.totalCount.toLocaleString("ko-KR")}건</strong></>} action={<Link href="/lease/write" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 font-bold text-white shadow-sm hover:bg-[#0f56c0]">지입 글 등록</Link>} />
      <Container className="space-y-7 py-8 sm:py-10">
        <LeaseFilters
        masterData={masterData}
        type={query.type}
        regionId={query.regionId}
        vehicleTypeId={query.vehicleTypeId}
        tonnageId={query.tonnageId}
        payType={query.payType}
        keyword={query.keyword}
        />
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">지입·차량 목록</h2><p className="text-sm text-muted-foreground">최신 등록순</p></div>
        {result.items.length === 0 ? (
          <EmptyState title="등록된 지입 정보가 없습니다." description="검색 조건을 넓히거나 새로운 지입 정보를 등록해 보세요." />
        ) : (
          <ul className="space-y-3.5">{result.items.map((post) => <li key={post.id}><LeaseCard post={post} /></li>)}</ul>
        )}
        <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        query={paginationQuery}
        basePath="/lease"
        />
      </Container>
    </div>
  );
}
