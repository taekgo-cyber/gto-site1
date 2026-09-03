import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { EmptyState } from "@/components/common/EmptyState";
import { PageIntro } from "@/components/common/PageIntro";
import { Input } from "@/components/ui/Input";
import { listPublicCompanies } from "@/lib/company/public";

export const metadata: Metadata = {
  title: "운송·화물 업체 정보",
  description: "운전픽에서 검토 완료된 운송·화물 업체와 현재 공개 중인 구인·지입 정보를 확인하세요.",
  alternates: { canonical: "/companies" },
};
export const dynamic = "force-dynamic";

type SearchParams = { q?: string; page?: string };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const data = await listPublicCompanies({ query: params.q, page });
  return (
    <div className="min-h-screen bg-surface">
      <PageIntro eyebrow="VERIFIED COMPANIES" title="운송·화물 업체 정보" description="운전픽에서 검토 완료된 활성 업체와 현재 공개 중인 채용·지입 정보를 확인하세요." meta={<>공개 업체 <strong className="text-primary">{data.total.toLocaleString("ko-KR")}곳</strong></>} />
      <Container className="space-y-7 py-8 sm:py-10">
        <form className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:flex-row sm:p-5" action="/companies" role="search">
          <div className="flex-1"><label htmlFor="company-query" className="mb-1.5 block text-sm font-bold">업체명 검색</label><Input id="company-query" name="q" defaultValue={params.q ?? ""} maxLength={100} placeholder="운송·물류 업체명을 입력하세요" /></div>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center self-end rounded-lg bg-primary px-6 font-bold text-white shadow-sm hover:bg-[#0f56c0]">검색</button>
        </form>
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">검토 완료 업체</h2><p className="text-sm text-muted-foreground">현재 공개 가능한 정보만 표시</p></div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {data.items.length === 0 ? (
            <EmptyState title="조건에 맞는 공개 업체가 없습니다." description="업체명을 줄여 검색하거나 전체 업체 목록을 확인해 보세요." />
          ) : (
            <div className={`grid gap-4 ${data.items.length > 1 ? "md:grid-cols-2" : ""}`}>
              {data.items.map((company) => (
                <Link key={company.id} href={`/companies/${company.id}`} className="group flex min-h-64 flex-col rounded-xl border border-border bg-background p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-deep text-xl font-black text-white shadow-sm">{company.name.slice(0, 2)}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200"><span aria-hidden="true">✓</span> 검토 완료</span>
                  </div>
                  <h3 className="mt-5 text-2xl font-bold tracking-[-0.025em]">{company.name}</h3>
                  <p className="mt-1 text-[15px] font-medium text-muted-foreground">{company.region?.name ?? "전국"}</p>
                  {company.introduction ? <p className="mt-3 line-clamp-2 text-[15px] leading-6 text-muted-foreground">{company.introduction}</p> : null}
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
                    <span className="font-semibold text-foreground">채용 {company._count.jobPosts} · 지입 {company._count.leasePosts}</span>
                    <span className="font-bold text-primary">업체 상세 <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <aside className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div className="bg-brand-deep p-5 text-white sm:p-6">
              <p className="text-xs font-black tracking-[0.13em] text-accent">DIRECTORY GUIDE</p>
              <h3 className="mt-2 text-xl font-bold">안심하고 업체를 비교하세요</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">공개 심사를 통과한 활성 업체와 현재 연결된 공고만 확인할 수 있습니다.</p>
            </div>
            <ul className="divide-y divide-border px-5 text-[15px] sm:px-6">
              <li className="flex gap-3 py-4"><span className="font-black text-primary">01</span><span><strong className="block text-foreground">업체 기본정보 확인</strong><span className="text-sm text-muted-foreground">지역과 공개 소개를 먼저 살펴보세요.</span></span></li>
              <li className="flex gap-3 py-4"><span className="font-black text-primary">02</span><span><strong className="block text-foreground">공고를 함께 비교</strong><span className="text-sm text-muted-foreground">채용과 지입 등록 건수를 바로 확인합니다.</span></span></li>
              <li className="flex gap-3 py-4"><span className="font-black text-primary">03</span><span><strong className="block text-foreground">상세 페이지 이동</strong><span className="text-sm text-muted-foreground">업체가 공개한 최신 정보를 확인하세요.</span></span></li>
            </ul>
          </aside>
        </div>
        {data.pageCount > 1 ? (
          <nav aria-label="업체 목록 페이지" className="flex items-center justify-center gap-3">
            {data.page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-bold" href={`/companies?q=${encodeURIComponent(params.q ?? "")}&page=${data.page - 1}`}>이전</Link> : null}
            <span className="text-sm font-medium text-muted-foreground">{data.page} / {data.pageCount}</span>
            {data.page < data.pageCount ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-bold" href={`/companies?q=${encodeURIComponent(params.q ?? "")}&page=${data.page + 1}`}>다음</Link> : null}
          </nav>
        ) : null}
        <aside className="flex flex-col justify-between gap-5 rounded-2xl bg-brand-deep p-6 text-white sm:flex-row sm:items-center sm:p-8">
          <div><p className="text-xs font-bold tracking-[0.12em] text-accent">FOR BUSINESS</p><h2 className="mt-2 text-2xl font-bold">운송·화물 업체를 운영하시나요?</h2><p className="mt-2 text-sm leading-6 text-white/70">업체 등록 심사를 거쳐 공개 정보와 채용·지입 서비스를 관리할 수 있습니다.</p></div>
          <Link href="/company/apply" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-white px-5 font-bold text-brand-deep hover:bg-blue-50">업체 등록 안내</Link>
        </aside>
      </Container>
    </div>
  );
}
