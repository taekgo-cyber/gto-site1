import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobPostDetailView } from "@/components/jobs/JobPostDetailView";
import { RelatedRecommendations } from "@/components/recommendations/RelatedRecommendations";
import { getApiUser } from "@/lib/api/auth";
import { getJobPostById } from "@/lib/jobs/dal";
import { getPublicRecommendations } from "@/lib/recommendations/dal";
import { getHomepageSampleDetail, sampleJobPost, isReadOnlyDetailPreview } from "@/lib/monetization/sample-details";
import { publicJobHref } from "@/lib/public-detail-links";

export async function generateMetadata(props: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  if (id.startsWith("sample-")) {
    const sample = getHomepageSampleDetail(id, "jobs");
    return { title: sample ? `${sample.title} · 샘플 광고` : "공고를 찾을 수 없습니다", robots: { index: false, follow: false } };
  }
  const post = await getJobPostById(id);
  return { title: post?.title ?? "공고", alternates: { canonical: publicJobHref(id) } };
}

export default async function JobPostPage(props: PageProps<"/jobs/[id]">) {
  const { id } = await props.params;
  if (id.startsWith("sample-")) {
    const sample = getHomepageSampleDetail(id, "jobs");
    if (!sample) notFound();
    return <JobPostDetailView post={sampleJobPost(sample)} sample={sample} />;
  }
  const user = await getApiUser();
  const [post, recommendations] = await Promise.all([
    getJobPostById(id, { includeContact: user !== null }),
    getPublicRecommendations({ domain: "JOBS", id }),
  ]);
  if (!post || post.status !== "OPEN") notFound();
  return <JobPostDetailView post={post} isLoggedIn={user !== null} readOnly={isReadOnlyDetailPreview()} recommendations={<RelatedRecommendations items={recommendations} />} />;
}
