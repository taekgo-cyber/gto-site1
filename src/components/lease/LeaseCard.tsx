import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { buildAttachmentUrl } from "@/lib/attachments/url";
import type { PostListItem } from "@/lib/posts/dal";
import { leasePostTypeLabel } from "@/lib/posts/labels";
import { formatDate, formatPayAmount, workTypeLabel } from "@/lib/jobs/labels";

export function LeaseCard({ post }: { post: PostListItem }) {
  const vehicle =
    post.vehicleTypeName || post.tonnageName
      ? [post.vehicleTypeName, post.tonnageName].filter(Boolean).join(" · ")
      : null;

  const region = post.regionName ?? null;
  const workType = post.workType ? workTypeLabel(post.workType) : null;
  const meta = [region, vehicle, workType].filter(Boolean);

  return (
    <Link
      href={`/lease/${post.id}`}
      className="block rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-surface"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.type === "HIRE" ? "primary" : "success"}>
              {leasePostTypeLabel(post.type)}
            </Badge>
            <h2 className="truncate text-base font-semibold text-foreground">
              {post.title}
            </h2>
          </div>

          {meta.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              {formatPayAmount(post.payType, post.payAmount)}
            </span>
            <span className="flex items-center gap-3 text-muted-foreground">
              <span>조회 {post.viewCount.toLocaleString("ko-KR")}</span>
              <span>{formatDate(post.publishedAt)}</span>
            </span>
          </div>
        </div>

        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-md border border-border bg-surface sm:h-20 sm:w-28">
          {post.representativeImage ? (
            <Image
              src={buildAttachmentUrl(post.id, post.representativeImage.id)}
              alt=""
              fill
              sizes="(min-width: 640px) 7rem, 100vw"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              이미지 없음
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
