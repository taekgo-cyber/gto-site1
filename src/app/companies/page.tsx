import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { listPublicCompanies } from "@/lib/company/public";

export const metadata: Metadata = {
  title: "운송·화물 업체 정보",
  description: "지입몰에서 승인된 운송·화물 업체와 현재 공개 중인 구인·지입 정보를 확인하세요.",
  alternates: { canonical: "/companies" },
};
export const dynamic = "force-dynamic";

type SearchParams = { q?: string; page?: string };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const data = await listPublicCompanies({ query: params.q, page });
  return (
    <Container className="space-y-6 py-8">
      <div>
        <p className="text-sm text-muted-foreground">검토 완료 업체</p>
        <h1 className="text-2xl font-bold">업체 정보</h1>
        <p className="mt-1 text-sm text-muted-foreground">ACTIVE 업체의 공개 정보와 현재 모집 글만 표시합니다.</p>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" action="/companies">
        <input name="q" defaultValue={params.q ?? ""} maxLength={100} placeholder="업체명 검색" className="min-h-11 flex-1 rounded-md border border-border px-3 text-base sm:text-sm" />
        <Button type="submit">검색</Button>
      </form>
      {data.items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 공개 업체가 없습니다.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((company) => (
            <Card key={company.id}>
              <CardHeader><CardTitle>{company.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{company.region?.name ?? "전국"}</p>
                <p className="line-clamp-3">{company.introduction ?? "등록된 업체 소개가 없습니다."}</p>
                <p className="text-xs text-muted-foreground">구인 {company._count.jobPosts} · 지입 {company._count.leasePosts}</p>
                <Link href={`/companies/${company.id}`}><Button variant="outline" size="sm">업체 보기</Button></Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {data.pageCount > 1 ? (
        <nav aria-label="업체 목록 페이지" className="flex items-center justify-center gap-2">
          {data.page > 1 ? <Link href={`/companies?q=${encodeURIComponent(params.q ?? "")}&page=${data.page - 1}`}><Button variant="outline" size="sm">이전</Button></Link> : null}
          <span className="text-sm text-muted-foreground">{data.page} / {data.pageCount}</span>
          {data.page < data.pageCount ? <Link href={`/companies?q=${encodeURIComponent(params.q ?? "")}&page=${data.page + 1}`}><Button variant="outline" size="sm">다음</Button></Link> : null}
        </nav>
      ) : null}
    </Container>
  );
}
