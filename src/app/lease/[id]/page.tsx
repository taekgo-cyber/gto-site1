import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeasePostDetailView } from "@/components/lease/LeasePostDetailView";
import { RelatedRecommendations } from "@/components/recommendations/RelatedRecommendations";
import { getApiUser } from "@/lib/api/auth";
import { getPostDetail, type PostPublic } from "@/lib/posts/service";
import { getPostAuthorPhone } from "@/lib/posts/dal";
import { getPublicRecommendations } from "@/lib/recommendations/dal";
import { getHomepageSampleDetail, sampleLeasePost, isReadOnlyDetailPreview } from "@/lib/monetization/sample-details";
import { publicLeaseHref } from "@/lib/public-detail-links";

export async function generateMetadata(props: PageProps<"/lease/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  if (id.startsWith("sample-")) {
    const sample = getHomepageSampleDetail(id, "lease");
    return { title: sample ? `${sample.title} · 샘플 광고` : "게시글을 찾을 수 없습니다", robots: { index: false, follow: false } };
  }
  return { title: "지입 게시글", alternates: { canonical: publicLeaseHref(id) } };
}

export default async function LeasePostDetailPage(props: PageProps<"/lease/[id]">) {
  const { id } = await props.params;
  if (id.startsWith("sample-")) {
    const sample = getHomepageSampleDetail(id, "lease");
    if (!sample) notFound();
    return <LeasePostDetailView post={sampleLeasePost(sample)} sample={sample} />;
  }
  const user = await getApiUser();
  let post: PostPublic;
  try { post = await getPostDetail(user, id, { recordView: !isReadOnlyDetailPreview() }); } catch { notFound(); }
  const [authorPhone, recommendations] = await Promise.all([
    user ? getPostAuthorPhone(id) : Promise.resolve(null),
    getPublicRecommendations({ domain: "LEASE", id }),
  ]);
  return <LeasePostDetailView post={post} isOwner={user !== null && user.id === post.author.id} isLoggedIn={user !== null} authorPhone={authorPhone} recommendations={<RelatedRecommendations items={recommendations} />} />;
}
