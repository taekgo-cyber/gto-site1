import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pagination } from "@/components/jobs/Pagination";
import { listPublicBlogCategories, listPublishedBlogArticles } from "@/lib/blog/dal";
import { parseBlogPage } from "@/lib/blog/validation";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string | string[] };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const query = await searchParams;
  const page = parseBlogPage(typeof query.page === "string" ? query.page : undefined);
  const canonical = page > 1 ? `/blog?page=${page}` : "/blog";
  return {
    title: "화물·지입 정보 블로그",
    description: "화물운송, 지입, 운송기사 취업과 자격시험에 필요한 실무 정보를 정리합니다.",
    alternates: { canonical },
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const page = parseBlogPage(typeof query.page === "string" ? query.page : undefined);
  const [categories, result] = await Promise.all([
    listPublicBlogCategories(),
    listPublishedBlogArticles({ page }),
  ]);

  return (
    <Container className="space-y-8 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">화물·지입 정보 블로그</h1>
        <p className="max-w-3xl text-muted-foreground">화물운송, 지입차, 운송기사 취업과 CBT 자격시험에 필요한 정보를 실무 중심으로 정리합니다.</p>
      </header>

      {categories.length > 0 ? (
        <nav aria-label="블로그 카테고리" className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link key={category.id} href={`/blog/category/${category.slug}`} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface">
              {category.name} <span className="text-muted-foreground">({category._count.articles})</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {result.items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">아직 발행된 글이 없습니다.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.items.map((article) => (
            <Link key={article.id} href={`/blog/${article.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:bg-surface/60">
                <CardHeader className="space-y-2">
                  {article.category ? <p className="text-xs font-medium text-muted-foreground">{article.category.name}</p> : null}
                  <CardTitle className="text-xl leading-snug">{article.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {article.excerpt ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{article.excerpt}</p> : null}
                  <p className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pagination currentPage={result.page} totalPages={result.totalPages} query={{}} basePath="/blog" />
    </Container>
  );
}
