import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getPublicCompany } from "@/lib/company/public";
import { buildCompanyInquiryHref } from "@/lib/support/links";

export const dynamic = "force-dynamic";
type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const company = await getPublicCompany(id);
  if (!company) return { title: "업체 정보를 찾을 수 없습니다", robots: { index: false, follow: false } };
  const description = (company.introduction ?? `${company.name}의 공개 구인·지입 정보를 확인하세요.`).slice(0, 155);
  return {
    title: `${company.name} 업체 정보`,
    description,
    alternates: { canonical: `/companies/${company.id}` },
    openGraph: { title: `${company.name} 업체 정보`, description, type: "website", url: `/companies/${company.id}` },
  };
}

function meta(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

export default async function PublicCompanyPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const company = await getPublicCompany(id);
  if (!company) notFound();
  return (
    <Container className="space-y-6 py-8">
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-7">
        <p className="text-sm font-medium text-primary">운전픽 검토 완료 업체</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{company.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{company.region?.name ?? "전국"} · 등록 {company.createdAt.toLocaleDateString("ko-KR")}</p>
        <p className="mt-5 whitespace-pre-wrap leading-7">{company.introduction ?? "등록된 업체 소개가 없습니다."}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={buildCompanyInquiryHref({ companyId: company.id, companyName: company.name })}><Button variant="outline">업체 관련 문의</Button></Link>
          <Link href="/companies"><Button variant="ghost">업체 목록</Button></Link>
        </div>
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">현재 구인·운송 정보</h2>
        {company.jobPosts.length === 0 ? <p className="rounded-md border p-5 text-sm text-muted-foreground">현재 공개 중인 구인·운송 정보가 없습니다.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {company.jobPosts.map((post) => (
              <Card key={post.id}><CardHeader><CardTitle>{post.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="text-muted-foreground">{meta([post.type, post.originRegion?.name, post.destRegion?.name, post.vehicleType?.name, post.tonnage?.name])}</p><Link href={`/jobs/${post.id}`}><Button variant="outline" size="sm">공고 보기</Button></Link></CardContent></Card>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">현재 지입 정보</h2>
        {company.leasePosts.length === 0 ? <p className="rounded-md border p-5 text-sm text-muted-foreground">현재 공개 중인 지입 정보가 없습니다.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {company.leasePosts.map((post) => (
              <Card key={post.id}><CardHeader><CardTitle>{post.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="text-muted-foreground">{meta([post.type, post.region?.name, post.vehicleType?.name, post.tonnage?.name])}</p><Link href={`/lease/${post.id}`}><Button variant="outline" size="sm">게시물 보기</Button></Link></CardContent></Card>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">사업자등록번호, 대표자 연락처, 내부 운영 정보는 공개하지 않습니다.</p>
    </Container>
  );
}
