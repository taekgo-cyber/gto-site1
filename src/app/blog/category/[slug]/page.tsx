import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pagination } from "@/components/jobs/Pagination";
import { getPublicBlogCategory, listPublishedBlogArticles } from "@/lib/blog/dal";
import { parseBlogPage } from "@/lib/blog/validation";

export const dynamic = "force-dynamic";

type Params = { slug: string };
type SearchParams = { page?: string | string[] };

async function loadCategory(slug: string) {
  try {
    return await getPublicBlogCategory(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await loadCategory(slug);
  if (!category) return { title: "블로그 카테고리", robots: { index: false, follow: false } };
  const page = parseBlogPage(typeof query.page === "string" ? query.page : undefined);
  const canonical = page > 1 ? `/blog/category/${category.slug}?page=${page}` : `/blog/category/${category.slug}`;
  return {
    title: `${category.name} - 화물·지입 정보 블로그`,
    description: category.description ?? `${category.name} 관련 화물·지입 실무 정보를 확인하세요.`,
    alternates: { canonical },
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function BlogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await loadCategory(slug);
  if (!category) notFound();
  const page = parseBlogPage(typeof query.page === "string" ? query.page : undefined);
  const result = await listPublishedBlogArticles({ categorySlug: category.slug, page });

  return (
    <Container className="space-y-8 py-8">
      <header className="space-y-2">
        <Link href="/blog" className="text-sm font-medium text-muted-foreground underline underline-offset-4">블로그 전체</Link>
        <h1 className="text-3xl font-bold">{category.name}</h1>
        {category.description ? <p className="max-w-3xl text-muted-foreground">{category.description}</p> : null}
      </header>

      {result.items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">이 카테고리에 발행된 글이 없습니다.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.items.map((article) => (
            <Link key={article.id} href={`/blog/${article.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:bg-surface/60">
                <CardHeader><CardTitle className="text-xl leading-snug">{article.title}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {article.excerpt ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{article.excerpt}</p> : null}
                  <p className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pagination currentPage={result.page} totalPages={result.totalPages} query={{}} basePath={`/blog/category/${category.slug}`} />
    </Container>
  );
}
