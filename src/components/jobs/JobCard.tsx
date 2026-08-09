import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { JobPostListItem } from "@/lib/jobs/dal";
import {
  formatDate,
  formatPayAmount,
  jobPostTypeLabel,
} from "@/lib/jobs/labels";

export function JobCard({ post }: { post: JobPostListItem }) {
  const route =
    post.originRegionName || post.destRegionName
      ? `${post.originRegionName ?? "-"} → ${post.destRegionName ?? "-"}`
      : null;

  const vehicle =
    post.vehicleTypeName || post.tonnageName
      ? [post.vehicleTypeName, post.tonnageName].filter(Boolean).join(" · ")
      : null;

  return (
    <Link
      href={`/jobs/${post.id}`}
      className="block rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-surface"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={post.type === "JOB" ? "primary" : "success"}>
          {jobPostTypeLabel(post.type)}
        </Badge>
        <h2 className="text-base font-semibold text-foreground">
          {post.title}
        </h2>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{post.companyName ?? "일반 등록"}</span>
        {route ? <span>{route}</span> : null}
        {vehicle ? <span>{vehicle}</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">
          {formatPayAmount(post.payType, post.payAmount)}
        </span>
        <span className="flex items-center gap-3 text-muted-foreground">
          <span>조회 {post.viewCount}</span>
          <span>마감 {formatDate(post.deadline)}</span>
        </span>
      </div>
    </Link>
  );
}
