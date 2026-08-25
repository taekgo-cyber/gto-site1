import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_STATUSES, type SupportTicketCategoryValue, type SupportTicketStatusValue } from "@/lib/support/contract";
import { listAdminSupportTickets } from "@/lib/support/service";

export const metadata: Metadata = { title: "고객 문의 - 관리자", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type SearchParams = { q?: string; status?: string; category?: string; page?: string };
const inputClass = "min-h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm";

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, params] = await Promise.all([requireRole("ADMIN"), searchParams]);
  const status = SUPPORT_TICKET_STATUSES.includes(params.status as never) ? params.status as SupportTicketStatusValue : "ALL";
  const category = SUPPORT_TICKET_CATEGORIES.includes(params.category as never) ? params.category as SupportTicketCategoryValue : "ALL";
  const data = await listAdminSupportTickets({ adminUserId: user.id, query: params.q, status, category, page: Number(params.page ?? "1") });
  const queryString = (page: number) => new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status !== "ALL" ? { status } : {}), ...(category !== "ALL" ? { category } : {}), page: String(page) }).toString();
  return <Container className="space-y-6 py-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">관리자 · CS</p><h1 className="text-2xl font-bold">고객 문의</h1><p className="mt-1 text-sm text-muted-foreground">검색·필터 후 상세에서 답변과 상태를 한 번에 처리합니다.</p></div><div className="flex gap-2"><Link href="/admin/companies"><Button variant="ghost" size="sm">업체 운영</Button></Link><Link href="/admin/ops"><Button variant="outline" size="sm">Ops 현황</Button></Link></div></div>
    <form className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto]" action="/admin/tickets"><input name="q" defaultValue={params.q ?? ""} maxLength={100} placeholder="문의 번호·제목·고객 검색" className={inputClass} /><select name="status" defaultValue={status} className={inputClass}><option value="ALL">전체 상태</option>{SUPPORT_TICKET_STATUSES.map((value) => <option key={value} value={value}>{SUPPORT_STATUS_LABELS[value]}</option>)}</select><select name="category" defaultValue={category} className={inputClass}><option value="ALL">전체 유형</option>{SUPPORT_TICKET_CATEGORIES.map((value) => <option key={value} value={value}>{SUPPORT_CATEGORY_LABELS[value]}</option>)}</select><Button type="submit">조회</Button></form>
    <Card><CardHeader><CardTitle>문의 {data.total}건</CardTitle></CardHeader><CardContent>{data.items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">조건에 맞는 문의가 없습니다.</p> : <ul className="divide-y rounded-md border">{data.items.map((ticket) => <li key={ticket.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{ticket.priority === "URGENT" ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">긴급</span> : null}<span className="truncate">{ticket.subject}</span></p><p className="mt-1 text-xs text-muted-foreground">{SUPPORT_CATEGORY_LABELS[ticket.category]} · {SUPPORT_STATUS_LABELS[ticket.status]} · {ticket.requesterName} · {ticket.createdAt.toLocaleString("ko-KR")}</p></div><Link href={`/admin/tickets/${ticket.id}`}><Button variant="outline" size="sm">처리</Button></Link></li>)}</ul>}</CardContent></Card>
    <nav aria-label="문의 목록 페이지" className="flex items-center justify-center gap-2">{data.page > 1 ? <Link href={`/admin/tickets?${queryString(data.page - 1)}`}><Button variant="outline" size="sm">이전</Button></Link> : null}<span className="text-sm text-muted-foreground">{data.page} / {data.pageCount}</span>{data.page < data.pageCount ? <Link href={`/admin/tickets?${queryString(data.page + 1)}`}><Button variant="outline" size="sm">다음</Button></Link> : null}</nav>
  </Container>;
}
