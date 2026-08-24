import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { MarkdownArticle } from "@/components/blog/MarkdownArticle";
import { BlogDiscovery } from "@/components/blog/BlogDiscovery";
import { getPublishedBlogArticleBySlug } from "@/lib/blog/dal";
import { getBlogArticleDiscovery } from "@/lib/blog/discovery";

export const dynamic = "force-dynamic";

type Params = { slug: string };

async function loadArticle(slug: string) {
  try {
    return await getPublishedBlogArticleBySlug(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return { title: "블로그 글", robots: { index: false, follow: false } };
  const title = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? article.excerpt ?? undefined;
  const modifiedAt = article.updatedAt ?? article.publishedAt;
  return {
    title,
    description,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      publishedTime: article.publishedAt.toISOString(),
      modifiedTime: modifiedAt.toISOString(),
      url: `/blog/${article.slug}`,
      tags: article.tags,
      images: article.featuredImageUrl ? [{ url: article.featuredImageUrl, alt: article.featuredImageAlt ?? article.title }] : undefined,
    },
    twitter: {
      card: article.featuredImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: article.featuredImageUrl ? [article.featuredImageUrl] : undefined,
    },
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();
  const discovery = await getBlogArticleDiscovery(article);
  const modifiedAt = article.updatedAt ?? article.publishedAt;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.seoDescription ?? article.excerpt ?? undefined,
    datePublished: article.publishedAt.toISOString(),
    dateModified: modifiedAt.toISOString(),
    mainEntityOfPage: `${siteUrl}/blog/${article.slug}`,
    image: article.featuredImageUrl ?? undefined,
    publisher: { "@type": "Organization", name: "트럭포털", url: siteUrl },
  }).replace(/</g, "\\u003c");

  return (
    <Container className="mx-auto max-w-4xl space-y-8 py-8">
      <script type="application/ld+json">{jsonLd}</script>
      <header className="space-y-4 border-b border-border pb-6">
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <Link href="/blog" className="font-medium underline underline-offset-4">블로그</Link>
          {article.category ? (
            <Link href={`/blog/category/${article.category.slug}`} className="font-medium underline underline-offset-4">{article.category.name}</Link>
          ) : null}
        </div>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{article.title}</h1>
        {article.excerpt ? <p className="text-lg leading-7 text-muted-foreground">{article.excerpt}</p> : null}
        {article.tags.length > 0 ? <div className="flex flex-wrap gap-2">{article.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">#{tag}</span>)}</div> : null}
        <p className="text-sm text-muted-foreground">
          {article.authorName ? `작성 ${article.authorName} · ` : ""}발행 {article.publishedAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
        </p>
      </header>

      {article.featuredImageUrl ? <img src={article.featuredImageUrl} alt={article.featuredImageAlt ?? article.title} className="max-h-[520px] w-full rounded-xl object-cover" /> : null}

      <MarkdownArticle markdown={article.contentMarkdown} />

      <BlogDiscovery relatedArticles={discovery.relatedArticles} serviceLinks={discovery.serviceLinks} />

      <footer className="border-t border-border pt-6">
        <Link href="/blog" className="text-sm font-medium underline underline-offset-4">블로그 목록으로 돌아가기</Link>
      </footer>
    </Container>
  );
}
