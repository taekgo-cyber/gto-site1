import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCompanyDetailView } from "@/components/company/PublicCompanyDetailView";
import { getPublicCompany } from "@/lib/company/public";
import { getHomepageSampleDetail, sampleCompany } from "@/lib/monetization/sample-details";
export const dynamic = "force-dynamic";
type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  if (id.startsWith("sample-")) {
    const sample = getHomepageSampleDetail(id, "companies");
    return { title: sample ? `${sample.companyName} · 샘플 광고` : "업체 정보를 찾을 수 없습니다", robots: { index: false, follow: false } };
  }
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

export default async function PublicCompanyPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  if (id.startsWith("sample-")) {
    const sample = getHomepageSampleDetail(id, "companies");
    if (!sample) notFound();
    return <PublicCompanyDetailView company={sampleCompany(sample)} sample={sample} />;
  }
  const company = await getPublicCompany(id);
  if (!company) notFound();
  return <PublicCompanyDetailView company={company} />;
}
