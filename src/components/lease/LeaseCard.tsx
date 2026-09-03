import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { buildAttachmentUrl } from "@/lib/attachments/url";
import type { PostListItem } from "@/lib/posts/dal";
import { leasePostTypeLabel } from "@/lib/posts/labels";
import { formatDate, formatPayAmount, workTypeLabel } from "@/lib/jobs/labels";

const TIER_LABELS = { MAIN: "MAIN", PREMIUM: "PREMIUM", GENERAL: "스폰서" } as const;

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
      className={`group block overflow-hidden rounded-xl border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${post.advertisementTier ? "border-primary/30" : "border-border"}`}
    >
      {post.advertisementTier ? <div className="bg-blue-50 px-4 py-1.5 text-[11px] font-black tracking-[0.1em] text-primary sm:px-5">{TIER_LABELS[post.advertisementTier]} · 광고</div> : null}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="relative order-first h-40 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-surface sm:h-28 sm:w-40">
          {post.representativeImage ? (
            <Image src={buildAttachmentUrl(post.id, post.representativeImage.id)} alt={`${post.title} 대표 이미지`} fill sizes="(min-width: 640px) 10rem, 100vw" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-surface px-3 text-center">
              <span aria-hidden="true" className="text-2xl font-black text-primary/30">운전픽</span>
              <span className="mt-1 text-xs font-semibold text-muted-foreground">지입·차량 정보</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.type === "HIRE" ? "primary" : "success"}>
              {leasePostTypeLabel(post.type)}
            </Badge>
            {post.companyName ? <span className="text-sm font-semibold text-muted-foreground">{post.companyName}</span> : null}
            <h2 className="w-full line-clamp-2 text-lg font-bold leading-snug text-foreground sm:text-xl">
              {post.title}
            </h2>
          </div>

          {meta.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
              {meta.map((item) => (
                <span key={item} className="rounded-md bg-surface px-2.5 py-1">{item}</span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 text-sm">
            <span className="text-lg font-black text-primary">
              {formatPayAmount(post.payType, post.payAmount)}
            </span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>조회 {post.viewCount.toLocaleString("ko-KR")}</span>
              <span>{formatDate(post.publishedAt)}</span>
            </span>
            <span className="ml-auto font-bold text-primary">상세 보기 <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
          </div>
        </div>
      </div>
    </Link>
  );
}
