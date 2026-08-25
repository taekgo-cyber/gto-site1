import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { getAdminOpsOverview } from "@/lib/ops/service";
import { retryOpsEventAction, sendOpsDigestAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "운영 자동화 - 관리자", robots: { index: false, follow: false } };
function date(value: Date | null) { return value ? value.toLocaleString("ko-KR") : "-"; }
function kstDate(value: Date | null) {
  return value ? value.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";
}

export default async function AdminOpsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const [user, params] = await Promise.all([requireRole("ADMIN"), searchParams]);
  const { counts, launch, events } = await getAdminOpsOverview(user.id);
  const metrics = [
    ["업체 승인", counts.pendingCompanies, "/admin/companies?status=PENDING"],
    ["미처리 문의", counts.openTickets, "/admin/tickets?status=OPEN"],
    ["긴급 문의", counts.urgentTickets, "/admin/tickets?status=OPEN"],
    ["장기 대기", counts.staleTickets, "/admin/tickets"],
    ["상태 예외", counts.anomalies, "/admin/companies"],
    ["전송 실패", counts.failedDeliveries, "#outbox"],
  ] as const;
  const launchMetrics = [
    ["오늘 신규 Lead", launch.newLeads, "/admin/leads"],
    ["오늘 unlock", launch.unlocks, "/admin/leads"],
    ["SUSPENDED 업체", launch.suspendedCompanies, "/admin/companies?status=SUSPENDED"],
    ["노출 중 광고", launch.activeCampaigns, "/admin/ads"],
    ["오늘 광고 노출", launch.adImpressions, "/admin/leads"],
    ["오늘 광고 클릭", launch.adClicks, "/admin/leads"],
    ["오늘 광고 전환", launch.adConversions, "/admin/leads"],
    ["오늘 알림 생성", launch.notificationsCreated, "/notifications"],
    ["미확인 알림", launch.unreadNotifications, "/notifications"],
    ["오늘 콘텐츠 발행", launch.contentPublished, "/admin/blog"],
    ["콘텐츠 작업 실패", launch.failedContentJobs, "/admin/blog/automation"],
  ] as const;
  return <Container className="space-y-6 py-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">관리자 · Automation</p><h1 className="text-2xl font-bold">오늘 처리할 업무</h1><p className="mt-1 text-sm text-muted-foreground">DB가 source of truth이며 Telegram은 모바일 운영 인터페이스입니다.</p></div><div className="flex gap-2"><Link href="/admin/companies"><Button variant="ghost" size="sm">업체</Button></Link><Link href="/admin/tickets"><Button variant="ghost" size="sm">문의</Button></Link></div></div>
    {params.message ? <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{params.message}</p> : null}{params.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p> : null}
    <Card><CardHeader><CardTitle>출시 제어 상태</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">공개 상태</p><p className="font-semibold">{launch.availability}</p></div><div><p className="text-xs text-muted-foreground">출시 단계</p><p className="font-semibold">{launch.launchPolicy?.phase ?? "CONFIG_INVALID"}</p></div><div><p className="text-xs text-muted-foreground">과금 수집</p><p className="font-semibold">{launch.launchPolicy?.paymentCollection ?? "DISABLED"}</p></div><div><p className="text-xs text-muted-foreground">다음 경계 (KST)</p><p className="font-semibold">{kstDate(launch.launchPolicy?.nextPhaseAt ?? null)}</p></div>{launch.launchPolicyError ? <p role="alert" className="sm:col-span-2 lg:col-span-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">출시 단계 환경변수가 올바르지 않습니다. Production preflight를 확인하세요.</p> : <p className="sm:col-span-2 lg:col-span-4 text-xs text-muted-foreground">현재 activation은 FREE_ONLY이며 기존 가격·quota는 변경하지 않습니다. DISCOUNTED/STANDARD는 승인된 PG/할인 정책 없이는 실제 청구를 활성화하지 않습니다.</p>}</CardContent></Card>
    <div><h2 className="text-lg font-bold">오늘의 출시 운영 지표</h2><p className="mt-1 text-xs text-muted-foreground">KST {kstDate(launch.window.start)}부터 집계하며 원문 PII는 조회하지 않습니다.</p></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">{launchMetrics.map(([label,value,href]) => <Link href={href} key={label}><Card className="h-full transition-colors hover:bg-surface"><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{value}</CardContent></Card></Link>)}</div>
    <div><h2 className="text-lg font-bold">처리 대기열</h2></div>
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">{metrics.map(([label,value,href]) => <Link href={href} key={label}><Card className="h-full transition-colors hover:bg-surface"><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{value}</CardContent></Card></Link>)}</div>
    <Card><CardHeader><CardTitle>Telegram digest</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">같은 KST 날짜 digest는 dedupeKey로 한 번만 생성됩니다. 미전송 outbox도 함께 재처리합니다.</p><form action={sendOpsDigestAction}><Button type="submit">지금 digest/대기열 처리</Button></form></CardContent></Card>
    <Card id="outbox"><CardHeader><CardTitle>운영 전송 outbox</CardTitle></CardHeader><CardContent>{events.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">운영 이벤트가 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">생성</th><th className="p-2">유형/대상</th><th className="p-2">상태</th><th className="p-2">시도</th><th className="p-2">오류</th><th className="p-2">전송</th><th className="p-2">관리</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b last:border-0"><td className="p-2">{date(event.createdAt)}</td><td className="p-2"><strong>{event.type}</strong><br/><span className="text-xs text-muted-foreground">{event.targetType} · {event.targetId}</span></td><td className="p-2">{event.status}</td><td className="p-2">{event.attemptCount}</td><td className="p-2">{event.lastErrorCode ?? "-"}</td><td className="p-2">{date(event.sentAt)}</td><td className="p-2">{event.status === "FAILED" ? <form action={retryOpsEventAction}><input type="hidden" name="eventId" value={event.id}/><Button type="submit" variant="outline" size="sm">재시도</Button></form> : "-"}</td></tr>)}</tbody></table></div>}</CardContent></Card>
    <p className="text-xs text-muted-foreground">Telegram token/chat ID/webhook secret은 서버 환경변수에서만 읽으며 payload에는 연락처·사업자 증빙·raw IP/UA를 저장하지 않습니다.</p>
  </Container>;
}
