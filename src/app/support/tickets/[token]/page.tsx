import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "@/lib/support/contract";
import { getPublicSupportTicket } from "@/lib/support/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "문의 처리 상태", robots: { index: false, follow: false } };

export default async function SupportTicketStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ticket = await getPublicSupportTicket(token);
  if (!ticket) notFound();
  return (
    <Container className="mx-auto max-w-3xl space-y-5 py-8">
      <div><p className="text-sm text-muted-foreground">고객 문의 상태</p><h1 className="text-2xl font-bold">{ticket.subject}</h1><p className="mt-1 text-sm text-muted-foreground">{SUPPORT_CATEGORY_LABELS[ticket.category]} · {SUPPORT_STATUS_LABELS[ticket.status]} · {ticket.createdAt.toLocaleString("ko-KR")}</p></div>
      <Card><CardHeader><CardTitle>문의 내용</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-6">{ticket.message}</p></CardContent></Card>
      <section className="space-y-3"><h2 className="text-xl font-bold">답변</h2>{ticket.replies.length === 0 ? <p className="rounded-md border p-5 text-sm text-muted-foreground">아직 등록된 답변이 없습니다. 운영자가 확인 중입니다.</p> : ticket.replies.map((reply) => <Card key={reply.id}><CardHeader><CardTitle>{reply.authorType === "ADMIN" ? "운전픽 운영팀" : "안내"}</CardTitle><p className="text-xs text-muted-foreground">{reply.createdAt.toLocaleString("ko-KR")}</p></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-6">{reply.message}</p></CardContent></Card>)}</section>
      <p className="text-xs text-muted-foreground">이 페이지 주소는 문의 답변을 확인하는 전용 링크입니다. 다른 사람에게 공유하지 마세요.</p>
    </Container>
  );
}
