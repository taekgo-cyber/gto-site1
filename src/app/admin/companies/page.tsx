import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { listAdminCompanies } from "@/lib/company/admin";

export const metadata: Metadata = { title: "업체 운영 - 관리자", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"] as const;
type CompanyStatusFilter = "ALL" | (typeof STATUSES)[number];
type SearchParams = { q?: string; status?: string; page?: string };
const inputClass = "min-h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm";

export default async function AdminCompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, params] = await Promise.all([requireRole("ADMIN"), searchParams]);
  const status: CompanyStatusFilter = STATUSES.includes(params.status as never) ? params.status as CompanyStatusFilter : "ALL";
  const data = await listAdminCompanies({ adminUserId: user.id, query: params.q, status, page: Number(params.page ?? "1") });
  const queryString = (page: number) => new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status !== "ALL" ? { status } : {}), page: String(page) }).toString();
  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-muted-foreground">관리자 · Company Ops</p><h1 className="text-2xl font-bold">업체 운영</h1><p className="mt-1 text-sm text-muted-foreground">승인부터 일시정지·재활성화까지 업체 전체 수명주기를 관리합니다.</p></div>
        <div className="flex gap-2"><Link href="/admin/tickets"><Button variant="ghost" size="sm">고객 문의</Button></Link><Link href="/admin/ops"><Button variant="outline" size="sm">Ops 현황</Button></Link></div>
      </div>
      <form className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto]" action="/admin/companies">
        <input name="q" defaultValue={params.q ?? ""} maxLength={100} placeholder="업체명·사업자번호·대표자 검색" className={inputClass} />
        <select name="status" defaultValue={status} className={inputClass}><option value="ALL">전체 상태</option>{STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <Button type="submit">조회</Button>
      </form>
      <Card><CardHeader><CardTitle>업체 {data.total}곳</CardTitle></CardHeader><CardContent>{data.items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">조건에 맞는 업체가 없습니다.</p> : <ul className="divide-y rounded-md border">{data.items.map((company) => <li key={company.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{company.name}</span>{company.status === "PENDING" ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">승인 필요</span> : null}</p><p className="mt-1 text-xs text-muted-foreground">{company.status} · {company.region?.name ?? "지역 미입력"} · 사업자 {company.businessNumber} · 대표 {company.representativeName}</p><p className="mt-1 text-xs text-muted-foreground">구인 {company._count.jobPosts} · 지입 {company._count.leasePosts} · Lead {company._count.leadMatches} · 광고 {company._count.adCampaigns}</p></div><Link href={`/admin/companies/${company.id}`}><Button variant="outline" size="sm">운영 상세</Button></Link></li>)}</ul>}</CardContent></Card>
      <nav aria-label="업체 목록 페이지" className="flex items-center justify-center gap-2">{data.page > 1 ? <Link href={`/admin/companies?${queryString(data.page - 1)}`}><Button variant="outline" size="sm">이전</Button></Link> : null}<span className="text-sm text-muted-foreground">{data.page} / {data.pageCount}</span>{data.page < data.pageCount ? <Link href={`/admin/companies?${queryString(data.page + 1)}`}><Button variant="outline" size="sm">다음</Button></Link> : null}</nav>
    </Container>
  );
}
