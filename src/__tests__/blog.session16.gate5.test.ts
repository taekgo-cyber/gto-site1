import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getArticle: vi.fn(),
  getCategory: vi.fn(),
  listSitemapRows: vi.fn(),
  leaseFindMany: vi.fn(),
  jobFindMany: vi.fn(),
  getLandingMaster: vi.fn(),
  getCbtCategories: vi.fn(),
}));

vi.mock("@/lib/blog/dal", () => ({
  getPublishedBlogArticleBySlug: mocks.getArticle,
  getPublicBlogCategory: mocks.getCategory,
  listPublishedBlogSitemapRows: mocks.listSitemapRows,
  listPublicBlogCategories: vi.fn(),
  listPublishedBlogArticles: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leasePost: { findMany: mocks.leaseFindMany },
    jobPost: { findMany: mocks.jobFindMany },
  },
}));

vi.mock("@/lib/seo/landing", () => ({ getSeoLandingMasterData: mocks.getLandingMaster }));
vi.mock("@/lib/cbt/dal", () => ({ getCbtCategories: mocks.getCbtCategories }));

import { generateMetadata as generateBlogMetadata } from "@/app/blog/page";
import { generateMetadata as generateArticleMetadata } from "@/app/blog/[slug]/page";
import { generateMetadata as generateCategoryMetadata } from "@/app/blog/category/[slug]/page";
import sitemap from "@/app/sitemap";

describe("Session 16 Gate 5 blog SEO/publication contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLandingMaster.mockResolvedValue({ regions: new Map(), tonnages: new Map() });
    mocks.leaseFindMany.mockResolvedValue([]);
    mocks.jobFindMany.mockResolvedValue([]);
    mocks.getCbtCategories.mockResolvedValue([]);
    mocks.listSitemapRows.mockResolvedValue({ articles: [], categories: [] });
  });

  it("uses self-canonical pagination URLs for the public blog list", async () => {
    await expect(generateBlogMetadata({ searchParams: Promise.resolve({}) })).resolves.toMatchObject({
      alternates: { canonical: "/blog" },
    });
    await expect(generateBlogMetadata({ searchParams: Promise.resolve({ page: "2" }) })).resolves.toMatchObject({
      alternates: { canonical: "/blog?page=2" },
    });
  });

  it("uses SEO fields for published articles with a stable slug canonical", async () => {
    mocks.getArticle.mockResolvedValue({
      id: "a1",
      slug: "safe-driving-guide",
      title: "기본 제목",
      excerpt: "기본 요약",
      contentMarkdown: "본문",
      seoTitle: "검색 제목",
      seoDescription: "검색 설명",
      publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      category: null,
      authorName: null,
    });

    await expect(generateArticleMetadata({ params: Promise.resolve({ slug: "safe-driving-guide" }) })).resolves.toMatchObject({
      title: "검색 제목",
      description: "검색 설명",
      alternates: { canonical: "/blog/safe-driving-guide" },
      openGraph: { type: "article", title: "검색 제목" },
    });
  });

  it("returns noindex metadata when a public article is unavailable", async () => {
    mocks.getArticle.mockResolvedValue(null);
    await expect(generateArticleMetadata({ params: Promise.resolve({ slug: "missing-article" }) })).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });
  });

  it("builds category canonical URLs only for active public categories", async () => {
    mocks.getCategory.mockResolvedValue({ id: "c1", slug: "driver-news", name: "기사 뉴스", description: "운송기사 뉴스" });
    await expect(
      generateCategoryMetadata({
        params: Promise.resolve({ slug: "driver-news" }),
        searchParams: Promise.resolve({ page: "3" }),
      }),
    ).resolves.toMatchObject({
      title: "기사 뉴스 - 화물·지입 정보 블로그",
      alternates: { canonical: "/blog/category/driver-news?page=3" },
    });

    mocks.getCategory.mockResolvedValue(null);
    await expect(
      generateCategoryMetadata({
        params: Promise.resolve({ slug: "inactive-category" }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
  });

  it("adds only DAL-approved blog article/category rows to sitemap alongside the blog root", async () => {
    mocks.listSitemapRows.mockResolvedValue({
      articles: [{ slug: "safe-driving-guide", updatedAt: new Date("2026-08-24T01:00:00.000Z") }],
      categories: [{ slug: "driver-news", updatedAt: new Date("2026-08-24T02:00:00.000Z") }],
    });

    const rows = await sitemap();
    const urls = rows.map((row) => row.url);
    expect(urls).toContain("http://localhost:3000/blog");
    expect(urls).toContain("http://localhost:3000/blog/safe-driving-guide");
    expect(urls).toContain("http://localhost:3000/blog/category/driver-news");
    expect(urls.some((url) => url.includes("draft"))).toBe(false);
    expect(mocks.leaseFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10_000 }));
    expect(mocks.jobFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 15_000 }));
  });
});
