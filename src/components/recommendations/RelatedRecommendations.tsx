import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { PublicRecommendationItem } from "@/lib/recommendations/contract";

const DOMAIN_LABEL = {
  JOBS: "구인공고",
  LEASE: "지입",
} as const;

export function RelatedRecommendations({
  items,
}: {
  items: PublicRecommendationItem[];
}) {
  if (items.length === 0) return null;

  return (
    <aside aria-labelledby="related-content-heading" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 id="related-content-heading" className="text-xl font-bold">조건이 비슷한 공개 정보</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          지역·차종·톤수 조건이 비슷한 최신 글을 추천합니다.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={`${item.domain}:${item.id}`} href={item.href} className="block h-full">
            <Card className="h-full transition-colors hover:bg-surface/60">
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="primary">{DOMAIN_LABEL[item.domain]}</Badge>
                  {item.reasons.map((reason) => (
                    <Badge key={reason.signal} variant="outline">{reason.label}</Badge>
                  ))}
                </div>
                <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
              </CardHeader>
              {item.context ? (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.context}</p>
                </CardContent>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
    </aside>
  );
}
