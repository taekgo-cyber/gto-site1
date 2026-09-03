import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { PageIntro } from "@/components/common/PageIntro";
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
    <div className="min-h-screen bg-surface">
      <PageIntro eyebrow="CUSTOMER SUPPORT" title="무엇을 도와드릴까요?" description="계정, 공고, 업체 등록과 광고 등 운전픽 서비스 이용 중 필요한 도움을 요청하세요." meta="문의 내용은 운전픽 시스템에 저장되며 운영자가 확인 후 답변합니다." />
      <Container className="grid items-start gap-6 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border bg-background"><p className="text-xs font-black tracking-[0.13em] text-primary">CONTACT FORM</p><CardTitle className="text-2xl">문의 접수</CardTitle><p className="text-sm leading-6 text-muted-foreground">필수 항목과 연락 가능한 이메일 또는 전화번호를 입력해 주세요.</p></CardHeader>
          <CardContent className="pt-5 sm:pt-6"><SupportForm defaults={{ name: user?.name, email: user?.email, phone: user?.phone ?? undefined, category: params.category, subject: params.subject?.slice(0, 120), message: params.message?.slice(0, 4_000) }} /></CardContent>
        </Card>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-brand-deep p-6 text-white shadow-sm">
            <p className="text-xs font-black tracking-[0.13em] text-accent">BEFORE CONTACT</p>
            <h2 className="mt-2 text-xl font-bold">문의 전 빠른 안내</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">등록 목적에 맞는 페이지에서 먼저 필요한 절차와 공개 정보를 확인할 수 있습니다.</p>
            <nav aria-label="고객지원 빠른 안내" className="mt-5 divide-y divide-white/10 border-y border-white/10">
              <SupportLink href="/company/apply" label="업체 등록 안내" />
              <SupportLink href="/company/ads" label="광고 서비스 확인" />
              <SupportLink href="/lease/write" label="지입 정보 등록" />
            </nav>
          </div>
          <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
            <h2 className="font-bold">문의 상태 확인</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">접수 완료 후 제공되는 전용 링크에서 처리 상태와 답변을 확인할 수 있습니다.</p>
          </div>
        </aside>
      </Container>
    </div>
  );
}

function SupportLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex min-h-12 items-center justify-between text-sm font-bold text-white/85 hover:text-white">{label}<span aria-hidden="true">→</span></Link>;
}
