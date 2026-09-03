import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { JobPostListItem } from "@/lib/jobs/dal";
import {
  formatDate,
  formatPayAmount,
  jobPostTypeLabel,
  workTypeLabel,
} from "@/lib/jobs/labels";

const TIER_LABELS = { MAIN: "MAIN", PREMIUM: "PREMIUM", GENERAL: "스폰서" } as const;

export function JobCard({ post }: { post: JobPostListItem }) {
  const route =
    post.originRegionName || post.destRegionName
      ? `${post.originRegionName ?? "-"} → ${post.destRegionName ?? "-"}`
      : null;

  const vehicle =
    post.vehicleTypeName || post.tonnageName
      ? [post.vehicleTypeName, post.tonnageName].filter(Boolean).join(" · ")
      : null;
  const workType = post.workType ? workTypeLabel(post.workType) : null;

  return (
    <Link
      href={`/jobs/${post.id}`}
      className={`group block overflow-hidden rounded-xl border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${post.advertisementTier ? "border-primary/30" : "border-border"}`}
    >
      {post.advertisementTier ? <div className="bg-blue-50 px-4 py-1.5 text-[11px] font-black tracking-[0.1em] text-primary sm:px-5">{TIER_LABELS[post.advertisementTier]} · 광고</div> : null}
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.type === "JOB" ? "primary" : "success"}>{jobPostTypeLabel(post.type)}</Badge>
            <span className="text-sm font-semibold text-muted-foreground">{post.companyName ?? "일반 등록"}</span>
          </div>
          <h2 className="mt-2 line-clamp-2 text-lg font-bold leading-snug tracking-[-0.01em] text-foreground sm:text-xl">{post.title}</h2>
          <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2 text-sm text-muted-foreground">
            {route ? <span className="rounded-md bg-surface px-2.5 py-1">{route}</span> : null}
            {vehicle ? <span className="rounded-md bg-surface px-2.5 py-1">{vehicle}</span> : null}
            {workType ? <span className="rounded-md bg-surface px-2.5 py-1">{workType}</span> : null}
          </div>
        </div>
        <div className="border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-right">
          <p className="text-lg font-black text-primary">{formatPayAmount(post.payType, post.payAmount)}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">마감 {formatDate(post.deadline)}<br />조회 {post.viewCount.toLocaleString("ko-KR")} · 등록 {formatDate(post.publishedAt)}</p>
          <span className="mt-2 inline-flex text-sm font-bold text-primary">상세 보기 <span aria-hidden="true" className="ml-1 transition-transform group-hover:translate-x-0.5">→</span></span>
        </div>
      </div>
    </Link>
  );
}
