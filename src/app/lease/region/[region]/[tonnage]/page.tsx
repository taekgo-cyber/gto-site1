import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { LeaseCard } from "@/components/lease/LeaseCard";
import { getLandingData } from "@/lib/seo/landing";
import { getPostList } from "@/lib/posts/dal";
import { DEFAULT_PAGE_SIZE } from "@/lib/posts/validation";

export const dynamic = "force-dynamic";

type TonnageLandingPageProps = {
  params: Promise<{ region: string; tonnage: string }>;
};

export async function generateMetadata(
  props: TonnageLandingPageProps,
): Promise<Metadata> {
  const { region, tonnage } = await props.params;
  const data = await getLandingData(region, tonnage);
  if (!data) return {};

  return {
    title: `${data.region.name} ${data.tonnage?.name ?? ""} 지입 구인·구직 매물 ${data.postCount}건`,
    description: `${data.region.name} ${data.tonnage?.name ?? ""} 지입 구인/구직 매물 ${data.postCount}건을 확인하세요. 매물 정보와 업체/작성자 정보를 확인하고 상세 페이지에서 문의할 수 있습니다.`,
    alternates: { canonical: `/lease/region/${region}/${tonnage}` },
  };
}

export default async function TonnageLandingPage(
  props: TonnageLandingPageProps,
) {
  const { region, tonnage } = await props.params;
  const data = await getLandingData(region, tonnage);
  if (!data) notFound();

  const result = await getPostList({
    regionId: data.region.id,
    tonnageId: data.tonnage?.id,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <Container className="space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">
          {data.region.name} {data.tonnage?.name ?? ""} 지입 구인·구직 매물{" "}
          {data.postCount}건
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.region.name} {data.tonnage?.name ?? ""} 조건의 지입 구인/구직
          게시글입니다.
        </p>
      </div>

      <ul className="space-y-3">
        {result.items.map((post) => (
          <li key={post.id}>
            <LeaseCard post={post} />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-center">
        <Link
          href={`/lease?regionId=${data.region.id}&tonnageId=${data.tonnage?.id}`}
          className="text-sm text-primary hover:underline"
        >
          {data.region.name} {data.tonnage?.name ?? ""} 전체 매물 보기
        </Link>
      </div>
    </Container>
  );
}
