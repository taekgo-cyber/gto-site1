import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { BlogDiscoveryArticle, BlogServiceLink } from "@/lib/blog/discovery";

export function BlogDiscovery({
  relatedArticles,
  serviceLinks,
}: {
  relatedArticles: BlogDiscoveryArticle[];
  serviceLinks: BlogServiceLink[];
}) {
  if (relatedArticles.length === 0 && serviceLinks.length === 0) return null;
  return (
    <aside aria-label="관련 정보" className="space-y-8 border-t border-border pt-8">
      {serviceLinks.length > 0 ? (
        <section aria-labelledby="service-links-heading" className="space-y-4">
          <div>
            <h2 id="service-links-heading" className="text-2xl font-bold">다음 단계로 이어가기</h2>
            <p className="mt-1 text-sm text-muted-foreground">현재 공개된 운전픽 서비스 정보만 연결합니다.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {serviceLinks.map((link) => (
              <Link key={link.kind} href={link.href} className="block h-full">
                <Card className="h-full transition-colors hover:bg-surface/60">
                  <CardHeader><CardTitle className="text-lg">{link.title}</CardTitle></CardHeader>
                  <CardContent><p className="text-sm leading-6 text-muted-foreground">{link.description}</p></CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {relatedArticles.length > 0 ? (
        <section aria-labelledby="related-articles-heading" className="space-y-4">
          <h2 id="related-articles-heading" className="text-2xl font-bold">함께 읽으면 좋은 글</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relatedArticles.map((article) => (
              <Link key={article.id} href={`/blog/${article.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:bg-surface/60">
                  <CardHeader className="space-y-2">
                    {article.category ? <p className="text-xs font-medium text-muted-foreground">{article.category.name}</p> : null}
                    <CardTitle className="text-lg leading-snug">{article.title}</CardTitle>
                  </CardHeader>
                  {article.excerpt ? <CardContent><p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{article.excerpt}</p></CardContent> : null}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
