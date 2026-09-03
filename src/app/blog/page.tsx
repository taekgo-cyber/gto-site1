import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionHeading } from "@/components/common/SectionHeading";
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
  const [featured, ...articles] = result.items;

  return (
    <div className="min-h-screen bg-surface">
      <section className="border-b border-border bg-background">
        <Container className="py-9 sm:py-12">
          <p className="text-sm font-bold text-primary">DRIVER KNOWLEDGE</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">운전·화물 실무 가이드</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">화물운송, 지입차, 운송기사 취업과 CBT 자격시험에 필요한 정보를 현장에서 읽기 쉽게 정리합니다.</p>
          {categories.length > 0 ? (
            <nav aria-label="블로그 카테고리" className="mt-6 flex flex-wrap gap-2">
              <Link href="/blog" aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-brand-deep px-4 text-sm font-bold text-white">전체 글 <span className="ml-1.5 text-white/65">{result.total}</span></Link>
              {categories.map((category) => (
                <Link key={category.id} href={`/blog/category/${category.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-bold text-foreground shadow-sm hover:border-primary/30 hover:bg-blue-50">
                  {category.name} <span className="ml-1.5 text-muted-foreground">{category._count.articles}</span>
                </Link>
              ))}
            </nav>
          ) : null}
        </Container>
      </section>

      <Container className="space-y-12 py-10 sm:py-12">
        {!featured ? (
          <EmptyState title="아직 발행된 글이 없습니다." description="공개된 실무 콘텐츠가 준비되면 이곳에서 확인할 수 있습니다." />
        ) : (
          <>
            <section aria-labelledby="featured-article-heading">
              <SectionHeading eyebrow="FEATURED" title="가장 최근 가이드" description="새롭게 발행된 운전·화물 실무 정보를 먼저 확인하세요." />
              <Link href={`/blog/${featured.slug}`} className="group mt-6 grid overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl lg:grid-cols-[1.08fr_0.92fr]">
                <BlogImage article={featured} eager />
                <div className="flex min-h-72 flex-col justify-center p-6 sm:p-8 lg:p-10">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span className="text-primary">{featured.category?.name ?? "운전픽 가이드"}</span><span className="text-border">|</span><span className="text-muted-foreground">{formatDate(featured.publishedAt)}</span></div>
                  <h2 id="featured-article-heading" className="mt-4 text-2xl font-black leading-snug tracking-[-0.025em] sm:text-3xl">{featured.title}</h2>
                  {featured.excerpt ? <p className="mt-4 line-clamp-3 text-sm leading-7 text-muted-foreground sm:text-base">{featured.excerpt}</p> : null}
                  <span className="mt-6 text-sm font-bold text-primary">가이드 읽기 <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
                </div>
              </Link>
            </section>

            {articles.length > 0 ? (
              <section aria-labelledby="latest-articles-heading">
                <SectionHeading eyebrow="LATEST" title="최신 실무 콘텐츠" description="필요한 주제를 골라 빠르게 읽어보세요." />
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {articles.map((article) => (
                    <Link key={article.id} href={`/blog/${article.slug}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                      <BlogImage article={article} />
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span className="text-primary">{article.category?.name ?? "가이드"}</span><span>{formatDate(article.publishedAt)}</span></div>
                        <h3 className="mt-3 line-clamp-2 text-xl font-bold leading-snug tracking-[-0.015em]">{article.title}</h3>
                        {article.excerpt ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{article.excerpt}</p> : null}
                        <span className="mt-auto pt-5 text-sm font-bold text-primary">자세히 보기 <span aria-hidden="true">→</span></span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="blog-discovery-heading" className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-7">
              <SectionHeading eyebrow="EXPLORE" title="필요한 정보로 바로 이동하세요" description="가이드와 함께 실제 채용·지입 정보, 자격시험 학습 서비스를 확인할 수 있습니다." />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <DiscoveryLink href="/jobs" index="01" title="구인·운송 공고" description="지역과 차량 조건으로 최신 공고 비교" />
                <DiscoveryLink href="/lease" index="02" title="지입·차량 정보" description="차량과 수익 조건을 빠르게 확인" />
                <DiscoveryLink href="/cbt" index="03" title="화물운송 CBT" description="과목별 학습과 실전 모의고사" />
              </div>
            </section>
          </>
        )}
        <Pagination currentPage={result.page} totalPages={result.totalPages} query={{}} basePath="/blog" />
      </Container>
    </div>
  );
}

function DiscoveryLink({ href, index, title, description }: { href: string; index: string; title: string; description: string }) {
  return <Link href={href} className="group flex min-h-32 items-start gap-4 rounded-xl bg-surface p-4 transition hover:bg-surface-strong"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-xs font-black text-primary shadow-sm">{index}</span><span><strong className="block text-lg text-foreground">{title}</strong><span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span><span className="mt-2 inline-flex text-sm font-bold text-primary">바로가기 <span aria-hidden="true" className="ml-1 transition-transform group-hover:translate-x-0.5">→</span></span></span></Link>;
}

type BlogItem = Awaited<ReturnType<typeof listPublishedBlogArticles>>["items"][number];

function BlogImage({ article, eager = false }: { article: BlogItem; eager?: boolean }) {
  if (!article.featuredImageUrl) {
    return <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-brand-deep to-brand-navy px-6 text-center text-lg font-black text-white">운전픽 실무 가이드</div>;
  }
  const imageUrl = normalizeBlogImageUrl(article.featuredImageUrl);
  return (
    <div className="aspect-[16/9] w-full overflow-hidden bg-surface lg:aspect-auto lg:min-h-80">
      {/* Blog images may be approved external URLs, so the native element preserves the existing host contract. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={article.featuredImageAlt ?? article.title} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} width={1200} height={675} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
    </div>
  );
}

function normalizeBlogImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
  return value;
}
