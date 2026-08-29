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

type BlogServiceIntent = BlogServiceLink["kind"];
type SourceIntentResolution =
  | { state: "none" }
  | { state: "match"; intent: BlogServiceIntent }
  | { state: "ambiguous" };

type IntentSignal = { value: string; mode: "contains" | "token" };

const INTENT_SIGNALS: Record<BlogServiceIntent, readonly IntentSignal[]> = {
  CBT: [
    { value: "화물운송종사자격", mode: "contains" },
    { value: "오답노트", mode: "contains" },
    { value: "cbt", mode: "token" },
  ],
  JOBS: [
    { value: "일자리", mode: "contains" },
    { value: "구인", mode: "contains" },
    { value: "구직", mode: "contains" },
    { value: "취업", mode: "contains" },
    { value: "채용", mode: "contains" },
    { value: "근무 조건", mode: "contains" },
    { value: "업무 조건", mode: "contains" },
    { value: "화물차 업무", mode: "contains" },
    { value: "업무 비교", mode: "contains" },
    { value: "업무 선택", mode: "contains" },
  ],
  LEASE: [
    { value: "지입", mode: "contains" },
    { value: "리스", mode: "token" },
  ],
};

function normalizeDiscoverySignal(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").trim().replace(/\s+/g, " ");
}

function matchesIntentSignal(text: string, signal: IntentSignal): boolean {
  const value = normalizeDiscoverySignal(signal.value);
  if (signal.mode === "contains") return text.includes(value);
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).includes(value);
}

function resolveIntentFromTexts(values: readonly string[]): SourceIntentResolution {
  const texts = values.map(normalizeDiscoverySignal).filter(Boolean);
  const matchedIntents = new Set<BlogServiceIntent>();
  for (const intent of ["CBT", "JOBS", "LEASE"] as const) {
    if (texts.some((text) => INTENT_SIGNALS[intent].some((signal) => matchesIntentSignal(text, signal)))) {
      matchedIntents.add(intent);
    }
  }
  if (matchedIntents.size === 0) return { state: "none" };
  if (matchedIntents.size > 1) return { state: "ambiguous" };
  return { state: "match", intent: [...matchedIntents][0]! };
}

function resolveBlogServiceIntent(
  article: Pick<BlogDiscoveryArticle, "title" | "tags" | "category">,
): BlogServiceIntent | null {
  const categorySlug = article.category?.slug;
  if (categorySlug === "cargo-driver-cbt") return "CBT";
  if (categorySlug === "jobs") return "JOBS";
  if (categorySlug === "lease") return "LEASE";
  if (categorySlug !== "cargo-practice" && categorySlug !== "beginner-guide") return null;

  const tagResolution = resolveIntentFromTexts(article.tags);
  if (tagResolution.state === "match") return tagResolution.intent;
  if (tagResolution.state === "ambiguous") return null;

  const titleResolution = resolveIntentFromTexts([article.title]);
  return titleResolution.state === "match" ? titleResolution.intent : null;
}

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

  const safeArticle = {
    ...article,
    tags: Array.isArray(article.tags)
      ? article.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };

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
  const relatedArticles = rankRelatedBlogArticles(safeArticle, candidates);
  const intent = resolveBlogServiceIntent(safeArticle);
  const serviceLinks: BlogServiceLink[] = [];
  if (intent === "CBT" && cbtCategories.length > 0) {
    serviceLinks.push({
      kind: "CBT",
      href: "/cbt",
      title: "화물운송 CBT",
      description: "회원가입 없이 학습 모드와 모의고사를 시작하세요.",
    });
  } else if (intent === "JOBS" && openJobCount > 0) {
    serviceLinks.push({ kind: "JOBS", href: "/jobs", title: "운송 일자리 찾기", description: "현재 공개 중인 구인·운송 공고를 확인하세요." });
  } else if (intent === "LEASE" && publishedLeaseCount > 0) {
    serviceLinks.push({ kind: "LEASE", href: "/lease", title: "지입 매물 살펴보기", description: "현재 공개 중인 지입 구인·구직 정보를 비교하세요." });
  }
  return { relatedArticles, serviceLinks };
}
