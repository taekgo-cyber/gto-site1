import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/dal";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = {
  title: "고객 문의",
  description: "업체 등록, 계정, 게시물, 광고와 서비스 이용 문의를 접수하세요.",
  alternates: { canonical: "/support" },
};
export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ category?: string; subject?: string; message?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <div><p className="text-sm text-muted-foreground">고객 지원</p><h1 className="text-2xl font-bold">무엇을 도와드릴까요?</h1><p className="mt-1 text-sm text-muted-foreground">문의는 지입몰 DB에 안전하게 저장되며 운영자가 확인 후 답변합니다.</p></div>
      <Card><CardHeader><CardTitle>문의 접수</CardTitle></CardHeader><CardContent><SupportForm defaults={{ name: user?.name, email: user?.email, phone: user?.phone ?? undefined, category: params.category, subject: params.subject?.slice(0, 120), message: params.message?.slice(0, 4_000) }} /></CardContent></Card>
    </Container>
  );
}
