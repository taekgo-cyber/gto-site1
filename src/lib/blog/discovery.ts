import { prisma } from "@/lib/prisma";
import { normalizeBlogTags } from "./validation";

export type BlogDiscoveryArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[];
  publishedAt: Date;
  category: { slug: string; name: string } | null;
};

export type BlogServiceLink = {
  kind: "CBT" | "JOBS" | "LEASE";
  href: string;
  title: string;
  description: string;
};

function normalizedTokens(values: Array<string | null | undefined>): Set<string> {
  return new Set(
    values
      .flatMap((value) => value?.normalize("NFKC").toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}]+/u) ?? [])
      .filter((value) => value.length >= 2),
  );
}

export function rankRelatedBlogArticles(
  current: Pick<BlogDiscoveryArticle, "id" | "title" | "tags" | "category">,
  candidates: BlogDiscoveryArticle[],
  limit = 3,
): BlogDiscoveryArticle[] {
  const currentTokens = normalizedTokens([current.title, current.category?.name, ...current.tags]);
  return candidates
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      const candidateTokens = normalizedTokens([candidate.title, candidate.category?.name, ...candidate.tags]);
      let score = current.category && candidate.category?.slug === current.category.slug ? 4 : 0;
      for (const token of candidateTokens) if (currentTokens.has(token)) score += 1;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || b.candidate.publishedAt.getTime() - a.candidate.publishedAt.getTime())
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}

export function chooseCbtCategoryLink(
  article: Pick<BlogDiscoveryArticle, "title" | "tags" | "category">,
  categories: Array<{ slug: string; name: string; description: string | null }>,
): { slug: string; name: string } | null {
  if (categories.length === 0) return null;
  const articleTokens = normalizedTokens([article.title, article.category?.name, ...article.tags]);
  const ranked = categories
    .map((category) => ({
      category,
      score: [...normalizedTokens([category.slug, category.name, category.description])]
        .filter((token) => articleTokens.has(token)).length,
    }))
    .sort((a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name, "ko-KR"));
  return ranked[0].score > 0 ? ranked[0].category : null;
}

export async function getBlogArticleDiscovery(
  article: Pick<BlogDiscoveryArticle, "id" | "title" | "tags" | "category">,
  now = new Date(),
): Promise<{ relatedArticles: BlogDiscoveryArticle[]; serviceLinks: BlogServiceLink[] }> {
  const [articleRows, cbtCategories, openJobCount, publishedLeaseCount] = await Promise.all([
    prisma.blogArticle.findMany({
      where: {
        id: { not: article.id },
        status: "PUBLISHED",
        publishedAt: { lte: now, not: null },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        tags: true,
        publishedAt: true,
        category: { select: { slug: true, name: true, isActive: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.cbtCategory.findMany({
      where: { isActive: true, questions: { some: { status: "PUBLISHED" } } },
      select: { slug: true, name: true, description: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 20,
    }),
    prisma.jobPost.count({ where: { status: "OPEN", deletedAt: null, publishedAt: { lte: now, not: null } } }),
    prisma.leasePost.count({ where: { status: "PUBLISHED", deletedAt: null, publishedAt: { lte: now, not: null } } }),
  ]);

  const candidates: BlogDiscoveryArticle[] = articleRows
    .filter((row) => row.publishedAt !== null)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      tags: normalizeBlogTags(row.tags),
      publishedAt: row.publishedAt!,
      category: row.category?.isActive ? { slug: row.category.slug, name: row.category.name } : null,
    }));
  const relatedArticles = rankRelatedBlogArticles(article, candidates);
  const cbtMatch = chooseCbtCategoryLink(article, cbtCategories);
  const serviceLinks: BlogServiceLink[] = [];
  if (cbtCategories.length > 0) {
    serviceLinks.push({
      kind: "CBT",
      href: cbtMatch ? `/cbt/${cbtMatch.slug}` : "/cbt",
      title: cbtMatch ? `${cbtMatch.name} CBT` : "화물운송 CBT",
      description: "회원가입 없이 학습 모드와 모의고사를 시작하세요.",
    });
  }
  if (openJobCount > 0) {
    serviceLinks.push({ kind: "JOBS", href: "/jobs", title: "운송 일자리 찾기", description: "현재 공개 중인 구인·운송 공고를 확인하세요." });
  }
  if (publishedLeaseCount > 0) {
    serviceLinks.push({ kind: "LEASE", href: "/lease", title: "지입 매물 살펴보기", description: "현재 공개 중인 지입 구인·구직 정보를 비교하세요." });
  }
  return { relatedArticles, serviceLinks };
}
