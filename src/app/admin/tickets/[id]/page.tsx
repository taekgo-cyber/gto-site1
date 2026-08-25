import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "@/lib/support/contract";
import { getAdminSupportTicket } from "@/lib/support/service";
import { ReplyForm, StatusForm } from "../TicketForms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "문의 상세 - 관리자", robots: { index: false, follow: false } };

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireRole("ADMIN"), params]);
  let ticket;
  try { ticket = await getAdminSupportTicket({ adminUserId: user.id, ticketId: id }); } catch (error) { if ((error as Error).message === "SUPPORT_TICKET_NOT_FOUND") notFound(); throw error; }
  return <Container className="mx-auto max-w-5xl space-y-6 py-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">관리자 · 문의 {ticket.id}</p><h1 className="text-2xl font-bold">{ticket.subject}</h1><p className="mt-1 text-sm text-muted-foreground">{SUPPORT_CATEGORY_LABELS[ticket.category]} · {SUPPORT_STATUS_LABELS[ticket.status]} · {ticket.priority}</p></div><Link href="/admin/tickets"><Button variant="ghost" size="sm">문의 목록</Button></Link></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]"><div className="space-y-5"><Card><CardHeader><CardTitle>고객 문의</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-muted-foreground">고객</dt><dd>{ticket.requesterName}</dd></div><div><dt className="text-muted-foreground">접수</dt><dd>{ticket.createdAt.toLocaleString("ko-KR")}</dd></div><div><dt className="text-muted-foreground">이메일</dt><dd className="break-all">{ticket.requesterEmail ?? "-"}</dd></div><div><dt className="text-muted-foreground">전화번호</dt><dd>{ticket.requesterPhone ?? "-"}</dd></div></dl><div className="border-t pt-4"><p className="whitespace-pre-wrap leading-6">{ticket.message}</p></div></CardContent></Card>
      <section className="space-y-3"><h2 className="text-xl font-bold">처리 기록</h2>{ticket.replies.length === 0 ? <p className="rounded-md border p-4 text-sm text-muted-foreground">등록된 답변이 없습니다.</p> : ticket.replies.map((reply) => <Card key={reply.id}><CardHeader><CardTitle>{reply.admin?.name ?? (reply.authorType === "SYSTEM" ? "시스템" : reply.authorType)}</CardTitle><p className="text-xs text-muted-foreground">{reply.createdAt.toLocaleString("ko-KR")} · {reply.deliveryStatus}</p></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-6">{reply.message}</p></CardContent></Card>)}</section></div>
      <aside className="space-y-5"><Card><CardHeader><CardTitle>답변</CardTitle></CardHeader><CardContent><ReplyForm ticketId={ticket.id} /></CardContent></Card><Card><CardHeader><CardTitle>상태 관리</CardTitle></CardHeader><CardContent><StatusForm ticketId={ticket.id} status={ticket.status} /></CardContent></Card><Card><CardHeader><CardTitle>고객 확인 링크</CardTitle></CardHeader><CardContent><Link href={`/support/tickets/${ticket.accessToken}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">웹 답변 화면 열기</Button></Link></CardContent></Card></aside></div>
  </Container>;
}
