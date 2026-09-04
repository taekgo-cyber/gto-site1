import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/common/Container";
import { PhoneInquiry } from "@/components/common/PhoneInquiry";
import { ViewCount } from "@/components/jobs/ViewCount";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { SampleDetailNotice, SampleDetailImage, SampleInquiryPreview } from "@/components/ads/SampleDetailPreview";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";
import type { JobPostDetail } from "@/lib/jobs/dal";
import { formatDate, formatPayAmount, jobPostTypeLabel, workTypeLabel } from "@/lib/jobs/labels";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-2 sm:grid-cols-[7rem_1fr]">
      <dt className="text-[15px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] text-foreground">{value}</dd>
    </div>
  );
}

export function JobPostDetailView({ post, isLoggedIn = false, recommendations, sample, readOnly = false }: {
  post: JobPostDetail; isLoggedIn?: boolean; recommendations?: ReactNode; sample?: PublicHomepageAdvertisement; readOnly?: boolean;
}) {
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

      {sample && <SampleDetailNotice />}
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
          {sample && <SampleDetailImage advertisement={sample} />}
          {post.description ? (
            <p className="whitespace-pre-wrap text-[17px] leading-[1.8] text-muted-foreground">
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
              value={sample ? "샘플 미리보기" : readOnly ? post.viewCount : <ViewCount jobPostId={post.id} initialViewCount={post.viewCount} />}
            />
          </dl>

          {post.originAddress || post.destAddress ? (
            <div className="mt-4 rounded-md bg-surface p-3 text-sm text-muted-foreground">
              <p>{route}</p>
              <p>{post.originAddress}</p>
              <p>{post.destAddress}</p>
            </div>
          ) : null}

          {sample ? <SampleInquiryPreview /> : post.companyPhone ? (
            <div className="mt-4 border-t border-border pt-4">
              <PhoneInquiry
                phone={post.companyPhone}
                isLoggedIn={isLoggedIn}
                returnTo={`/jobs/${post.id}`}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
      {recommendations}
    </Container>
  );
}
