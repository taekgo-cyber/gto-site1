import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { PhoneInquiry } from "@/components/common/PhoneInquiry";
import { ViewCount } from "@/components/jobs/ViewCount";
import { RelatedRecommendations } from "@/components/recommendations/RelatedRecommendations";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getApiUser } from "@/lib/api/auth";
import { getJobPostById } from "@/lib/jobs/dal";
import { getPublicRecommendations } from "@/lib/recommendations/dal";
import {
  formatDate,
  formatPayAmount,
  jobPostTypeLabel,
  workTypeLabel,
} from "@/lib/jobs/labels";

export async function generateMetadata(
  props: PageProps<"/jobs/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const post = await getJobPostById(id);
  return {
    title: post?.title ?? "공고",
    alternates: { canonical: `/jobs/${id}` },
  };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-2 sm:grid-cols-[7rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export default async function JobPostPage(props: PageProps<"/jobs/[id]">) {
  const { id } = await props.params;
  const [post, user, recommendations] = await Promise.all([
    getJobPostById(id),
    getApiUser(),
    getPublicRecommendations({ domain: "JOBS", id }),
  ]);

  if (!post || post.status !== "OPEN") notFound();

  const route =
    post.originRegionName || post.destRegionName
      ? `${post.originRegionName ?? "-"} → ${post.destRegionName ?? "-"}`
      : "-";

  return (
    <Container className="mx-auto max-w-3xl space-y-4 py-8">
      <Link
        href="/jobs"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← 목록으로
      </Link>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={post.type === "JOB" ? "primary" : "success"}>
              {jobPostTypeLabel(post.type)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {post.companyName ?? "일반 등록"} ·{" "}
              {formatDate(post.publishedAt)}
            </span>
          </div>
          <CardTitle className="text-xl sm:text-2xl">{post.title}</CardTitle>
        </CardHeader>

        <CardContent>
          {post.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {post.description}
            </p>
          ) : null}

          <dl className="mt-4 divide-y divide-border border-t border-border">
            <DetailRow label="출발지" value={post.originRegionName ?? "-"} />
            <DetailRow label="도착지" value={post.destRegionName ?? "-"} />
            <DetailRow label="차종" value={post.vehicleTypeName ?? "-"} />
            <DetailRow label="톤수" value={post.tonnageName ?? "-"} />
            <DetailRow
              label="급여"
              value={formatPayAmount(post.payType, post.payAmount)}
            />
            <DetailRow
              label="근무형태"
              value={post.workType ? workTypeLabel(post.workType) : "-"}
            />
            <DetailRow
              label="근무조건"
              value={post.workDescription ?? "-"}
            />
            <DetailRow label="마감일" value={formatDate(post.deadline)} />
            <DetailRow
              label="조회수"
              value={<ViewCount jobPostId={post.id} initialViewCount={post.viewCount} />}
            />
          </dl>

          {post.originAddress || post.destAddress ? (
            <div className="mt-4 rounded-md bg-surface p-3 text-sm text-muted-foreground">
              <p>{route}</p>
              <p>{post.originAddress}</p>
              <p>{post.destAddress}</p>
            </div>
          ) : null}

          {post.companyPhone ? (
            <div className="mt-4 border-t border-border pt-4">
              <PhoneInquiry phone={post.companyPhone} isLoggedIn={user !== null} />
            </div>
          ) : null}
        </CardContent>
      </Card>
      <RelatedRecommendations items={recommendations} />
    </Container>
  );
}
