import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  categoryFindUnique: vi.fn(),
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  categoryFindMany: vi.fn(),
  categoryFindFirst: vi.fn(),
  articleCreate: vi.fn(),
  articleUpdate: vi.fn(),
  articleFindUnique: vi.fn(),
  articleFindMany: vi.fn(),
  articleFindFirst: vi.fn(),
  articleCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    blogCategory: {
      findUnique: mocks.categoryFindUnique,
      create: mocks.categoryCreate,
      update: mocks.categoryUpdate,
      findMany: mocks.categoryFindMany,
      findFirst: mocks.categoryFindFirst,
    },
    blogArticle: {
      create: mocks.articleCreate,
      update: mocks.articleUpdate,
      findUnique: mocks.articleFindUnique,
      findMany: mocks.articleFindMany,
      findFirst: mocks.articleFindFirst,
      count: mocks.articleCount,
    },
  },
}));

import { getPublishedBlogArticleBySlug, listPublishedBlogArticles } from "@/lib/blog/dal";
import { createBlogArticle, setBlogArticleStatus } from "@/lib/blog/service";
import { validateBlogCategoryInput, validateBlogSlug } from "@/lib/blog/validation";

describe("Session 16 Gate 2 blog CMS foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    mocks.categoryFindUnique.mockResolvedValue({ id: "cat-1", isActive: true });
  });

  it("enforces canonical lowercase hyphen slugs", () => {
    expect(validateBlogSlug("truck-jobs-101")).toBe("truck-jobs-101");
    for (const invalid of ["Truck-jobs", "truck--jobs", "-truck", "truck-", "ab", "한글-slug"]) {
      expect(() => validateBlogSlug(invalid)).toThrow("BLOG_SLUG_INVALID");
    }
  });

  it("requires a real boolean for category activation instead of coercing strings", () => {
    expect(validateBlogCategoryInput({ slug: "driver-news", name: "기사 뉴스", isActive: false }).isActive).toBe(false);
    expect(() => validateBlogCategoryInput({ slug: "driver-news", name: "기사 뉴스", isActive: "false" })).toThrow(
      "BLOG_CATEGORY_ACTIVE_INVALID",
    );
  });

  it("creates articles only as DRAFT with the authenticated admin as author", async () => {
    mocks.articleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "article-1",
      slug: data.slug,
      status: data.status,
    }));

    await expect(
      createBlogArticle({
        actorUserId: "admin-1",
        slug: "safe-driving-guide",
        title: "안전 운행 가이드",
        excerpt: "화물 운전자를 위한 기본 가이드",
        contentMarkdown: "# 안전 운행\n\n본문",
        categoryId: "cat-1",
      }),
    ).resolves.toEqual({ id: "article-1", slug: "safe-driving-guide", status: "DRAFT" });

    expect(mocks.articleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: "admin-1", status: "DRAFT", publishedAt: null, categoryId: "cat-1" }),
      }),
    );
  });

  it("rejects CMS writes for non-active-admin actors", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", role: "USER", status: "ACTIVE" });

    await expect(
      createBlogArticle({
        actorUserId: "user-1",
        slug: "safe-driving-guide",
        title: "안전 운행 가이드",
        contentMarkdown: "본문",
      }),
    ).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.articleCreate).not.toHaveBeenCalled();
  });

  it("rejects assigning an inactive category to a new article", async () => {
    mocks.categoryFindUnique.mockResolvedValue({ id: "cat-1", isActive: false });

    await expect(
      createBlogArticle({
        actorUserId: "admin-1",
        slug: "safe-driving-guide",
        title: "안전 운행 가이드",
        contentMarkdown: "본문",
        categoryId: "cat-1",
      }),
    ).rejects.toThrow("BLOG_CATEGORY_INACTIVE");
    expect(mocks.articleCreate).not.toHaveBeenCalled();
  });

  it("publishes only through the explicit status transition and preserves first publishedAt", async () => {
    const firstPublishedAt = new Date("2026-08-24T00:00:00.000Z");
    const later = new Date("2026-08-25T00:00:00.000Z");
    mocks.articleFindUnique.mockResolvedValue({
      id: "article-1",
      slug: "safe-driving-guide",
      title: "안전 운행 가이드",
      contentMarkdown: "본문",
      publishedAt: firstPublishedAt,
      categoryId: "cat-1",
    });
    mocks.articleUpdate.mockResolvedValue({
      id: "article-1",
      slug: "safe-driving-guide",
      status: "PUBLISHED",
      publishedAt: firstPublishedAt,
    });

    await setBlogArticleStatus({ actorUserId: "admin-1", articleId: "article-1", status: "PUBLISHED", now: later });

    expect(mocks.articleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "article-1" },
        data: { status: "PUBLISHED", publishedAt: firstPublishedAt },
      }),
    );
  });

  it("public list is fail-closed to effective PUBLISHED rows and active category filters", async () => {
    const now = new Date("2026-08-24T01:00:00.000Z");
    mocks.articleCount.mockResolvedValue(1);
    mocks.articleFindMany.mockResolvedValue([
      {
        id: "article-1",
        slug: "safe-driving-guide",
        title: "안전 운행 가이드",
        excerpt: null,
        publishedAt: new Date("2026-08-24T00:00:00.000Z"),
        category: { slug: "driver-news", name: "기사 뉴스", isActive: true },
      },
    ]);

    const result = await listPublishedBlogArticles({ categorySlug: "driver-news", now });
    expect(result.total).toBe(1);
    expect(mocks.articleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PUBLISHED",
          publishedAt: { lte: now, not: null },
          category: { slug: "driver-news", isActive: true },
        },
        take: 12,
      }),
    );
  });

  it("direct article lookup remains public when its old category is inactive, but omits that category", async () => {
    const publishedAt = new Date("2026-08-24T00:00:00.000Z");
    mocks.articleFindFirst.mockResolvedValue({
      id: "article-1",
      slug: "safe-driving-guide",
      title: "안전 운행 가이드",
      excerpt: null,
      contentMarkdown: "<script>alert(1)</script>\n\nMarkdown source",
      seoTitle: null,
      seoDescription: null,
      publishedAt,
      category: { slug: "driver-news", name: "기사 뉴스", isActive: false },
      author: { name: "관리자" },
    });

    const article = await getPublishedBlogArticleBySlug("safe-driving-guide", new Date("2026-08-24T01:00:00.000Z"));
    expect(article?.category).toBeNull();
    expect(article?.contentMarkdown).toContain("<script>");
    expect(mocks.articleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PUBLISHED" }) }),
    );
  });
});
