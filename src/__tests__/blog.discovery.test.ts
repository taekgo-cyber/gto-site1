import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  articleFindMany: vi.fn(),
  categoryFindMany: vi.fn(),
  jobCount: vi.fn(),
  leaseCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    blogArticle: { findMany: mocks.articleFindMany },
    cbtCategory: { findMany: mocks.categoryFindMany },
    jobPost: { count: mocks.jobCount },
    leasePost: { count: mocks.leaseCount },
  },
}));

import { chooseCbtCategoryLink, getBlogArticleDiscovery, rankRelatedBlogArticles, type BlogDiscoveryArticle } from "@/lib/blog/discovery";

const publishedAt = new Date("2026-08-24T00:00:00.000Z");
function article(input: Partial<BlogDiscoveryArticle> & Pick<BlogDiscoveryArticle, "id" | "slug" | "title">): BlogDiscoveryArticle {
  return { excerpt: null, tags: [], category: null, publishedAt, ...input };
}

describe("Blog S19 discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.articleFindMany.mockResolvedValue([]);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.jobCount.mockResolvedValue(0);
    mocks.leaseCount.mockResolvedValue(0);
  });

  it("ranks same-category and shared-tag articles without linking the current article", () => {
    const current = article({ id: "current", slug: "current", title: "5톤 지입 준비", tags: ["5톤"], category: { slug: "guide", name: "가이드" } });
    const ranked = rankRelatedBlogArticles(current, [
      current,
      article({ id: "other", slug: "other", title: "운송 정보", category: { slug: "news", name: "뉴스" } }),
      article({ id: "best", slug: "best", title: "5톤 체크리스트", tags: ["5톤"], category: { slug: "guide", name: "가이드" } }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["best", "other"]);
  });

  it("returns only an authoritative CBT category and falls back to no category match", () => {
    const current = article({ id: "current", slug: "current", title: "화물 자격 시험 준비", tags: ["안전관리"] });
    const categories = [
      { slug: "cargo-law", name: "화물운송 법규", description: null },
      { slug: "safety", name: "안전관리", description: "안전관리 시험" },
    ];
    expect(chooseCbtCategoryLink(current, categories)).toEqual(categories[1]);
    expect(chooseCbtCategoryLink(article({ id: "x", slug: "x", title: "완전히 다른 글" }), categories)).toBeNull();
  });

  it("omits phantom service links and queries only publicly visible source records", async () => {
    const current = article({ id: "current", slug: "current", title: "화물 정보" });
    const result = await getBlogArticleDiscovery(current, publishedAt);
    expect(result.serviceLinks).toEqual([]);
    expect(mocks.categoryFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, questions: { some: { status: "PUBLISHED" } } },
    }));
    expect(mocks.jobCount).toHaveBeenCalledWith({ where: { status: "OPEN", deletedAt: null, publishedAt: { lte: publishedAt, not: null } } });
    expect(mocks.leaseCount).toHaveBeenCalledWith({ where: { status: "PUBLISHED", deletedAt: null, publishedAt: { lte: publishedAt, not: null } } });
  });

  it("builds service URLs only from verified DB availability and an existing CBT slug", async () => {
    mocks.categoryFindMany.mockResolvedValue([{ slug: "safety", name: "안전관리", description: null }]);
    mocks.jobCount.mockResolvedValue(2);
    mocks.leaseCount.mockResolvedValue(1);
    const result = await getBlogArticleDiscovery(article({ id: "current", slug: "current", title: "안전관리 준비" }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual(["/cbt/safety", "/jobs", "/lease"]);
  });
});
