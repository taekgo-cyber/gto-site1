import Link from "next/link";
import { Container } from "@/components/common/Container";
import { PhoneInquiry } from "@/components/common/PhoneInquiry";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LeaseGallery } from "@/components/lease/LeaseGallery";
import { LeaseDeleteButton } from "@/components/lease/LeaseDeleteButton";
import type { PostPublic } from "@/lib/posts/service";
import { leasePostStatusLabel, leasePostTypeLabel } from "@/lib/posts/labels";
import { formatDate, formatPayAmount, workTypeLabel } from "@/lib/jobs/labels";
import { buildAttachmentUrl } from "@/lib/attachments/url";

import type { ReactNode } from "react";
import { SampleDetailNotice, SampleDetailImage, SampleInquiryPreview } from "@/components/ads/SampleDetailPreview";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-2 sm:grid-cols-[7rem_1fr]">
      <dt className="text-[15px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] text-foreground">{value}</dd>
    </div>
  );
}

function conditionsToText(conditions: unknown): string | null {
  if (conditions && typeof conditions === "object" && !Array.isArray(conditions)) {
    const text = (conditions as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  if (Array.isArray(conditions)) {
    return conditions
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }
  return null;
}

export function LeasePostDetailView({ post, isOwner = false, isLoggedIn = false, authorPhone = null, recommendations, sample }: {
  post: PostPublic; isOwner?: boolean; isLoggedIn?: boolean; authorPhone?: string | null; recommendations?: ReactNode; sample?: PublicHomepageAdvertisement;
}) {
  const images = post.attachments.filter((attachment) => attachment.mediaType === "IMAGE");
  const documents = post.attachments.filter(
    (attachment) => attachment.mediaType === "DOCUMENT",
  );
  const conditionsText = conditionsToText(post.conditions);

  return (
    <Container className="mx-auto max-w-3xl space-y-4 py-8">
      <Link
        href="/lease"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← 목록으로
      </Link>

      {sample && <SampleDetailNotice />}
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.type === "HIRE" ? "primary" : "success"}>
              {leasePostTypeLabel(post.type)}
            </Badge>
            {isOwner ? (
              <Badge variant="outline">{leasePostStatusLabel(post.status)}</Badge>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {post.author.nickname ?? post.author.name} · {formatDate(post.createdAt)}
            </span>
          </div>
          <CardTitle className="text-xl sm:text-2xl">{post.title}</CardTitle>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>작성일 {formatDate(post.createdAt)}</span>
            {post.updatedAt.getTime() !== post.createdAt.getTime() ? (
              <span>수정일 {formatDate(post.updatedAt)}</span>
            ) : null}
            <span>조회 {post.viewCount.toLocaleString("ko-KR")}</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {sample && <SampleDetailImage advertisement={sample} />}
          <dl className="divide-y divide-border border-y border-border">
            <DetailRow label="지역" value={post.regionName ?? "-"} />
            <DetailRow label="차종" value={post.vehicleTypeName ?? "-"} />
            <DetailRow label="톤수" value={post.tonnageName ?? "-"} />
            <DetailRow
              label="급여/매출"
              value={formatPayAmount(post.payType, post.payAmount)}
            />
            <DetailRow
              label="근무 형태"
              value={post.workType ? workTypeLabel(post.workType) : "-"}
            />
            {conditionsText ? (
              <DetailRow
                label="기타 조건"
                value={<span className="whitespace-pre-wrap">{conditionsText}</span>}
              />
            ) : null}
          </dl>

          <div>
            <h2 className="mb-2 text-[15px] font-medium text-muted-foreground">상세 내용</h2>
            <p className="whitespace-pre-wrap text-[17px] leading-[1.8] text-foreground">
              {post.content}
            </p>
          </div>

          {sample ? <SampleInquiryPreview /> : (
            <div className="border-t border-border pt-4">
              <PhoneInquiry
                phone={authorPhone}
                isLoggedIn={isLoggedIn}
                returnTo={`/lease/${post.id}`}
              />
            </div>
          )}

          {images.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                첨부 이미지 ({images.length})
              </h2>
              <LeaseGallery
                postId={post.id}
                images={images.map((image) => ({
                  id: image.id,
                  originalName: image.originalName,
                }))}
              />
            </div>
          ) : null}

          {documents.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                첨부파일 ({documents.length})
              </h2>
              <ul className="space-y-2">
                {documents.map((document) => (
                  <li key={document.id}>
                    <a
                      href={buildAttachmentUrl(post.id, document.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-primary hover:bg-surface"
                    >
                      <span className="truncate">{document.originalName}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {(document.fileSize / 1024).toFixed(0)}KB
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {isOwner ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Link href={`/lease/${post.id}/edit`}>
                <Button variant="outline">수정</Button>
              </Link>
              <LeaseDeleteButton postId={post.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>
      {recommendations}
    </Container>
  );
}
