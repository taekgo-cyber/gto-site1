import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  categoryFindUnique: vi.fn(),
  articleCreate: vi.fn(),
  articleFindUnique: vi.fn(),
  articleUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    blogCategory: { findUnique: mocks.categoryFindUnique },
    blogArticle: {
      create: mocks.articleCreate,
      findUnique: mocks.articleFindUnique,
      update: mocks.articleUpdate,
    },
  },
}));

import { safeMarkdownHref } from "@/components/blog/MarkdownArticle";
import { createBlogArticle, setBlogArticleStatus } from "@/lib/blog/service";
import { validateBlogArticleInput } from "@/lib/blog/validation";

describe("canonical Blog CMS integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    mocks.categoryFindUnique.mockResolvedValue({ id: "cat-1", isActive: true });
  });

  it("normalizes tags and validates featured image URL/ALT", () => {
    const data = validateBlogArticleInput({
      slug: "cargo-guide",
      title: "화물차 운영 가이드",
      contentMarkdown: "본문",
      tags: "지입, 화물차, 지입",
      featuredImageUrl: "https://example.com/truck.jpg",
      featuredImageAlt: "화물차 이미지",
    });

    expect(data.tags).toEqual(["지입", "화물차"]);
    expect(data.featuredImageUrl).toBe("https://example.com/truck.jpg");
    expect(data.featuredImageAlt).toBe("화물차 이미지");
  });

  it("rejects unsafe featured image URLs and requires ALT text", () => {
    const base = { slug: "cargo-guide", title: "화물차 운영 가이드", contentMarkdown: "본문" };
    expect(() => validateBlogArticleInput({ ...base, featuredImageUrl: "javascript:alert(1)", featuredImageAlt: "x" })).toThrow(
      "BLOG_FEATURED_IMAGE_URL_INVALID",
    );
    expect(() => validateBlogArticleInput({ ...base, featuredImageUrl: "//evil.example/x.jpg", featuredImageAlt: "x" })).toThrow(
      "BLOG_FEATURED_IMAGE_URL_INVALID",
    );
    expect(() => validateBlogArticleInput({ ...base, featuredImageUrl: "https://example.com/x.jpg" })).toThrow(
      "BLOG_FEATURED_IMAGE_ALT_REQUIRED",
    );
  });

  it("keeps Markdown links fail-closed to internal/http/https targets", () => {
    expect(safeMarkdownHref("/lease")).toBe("/lease");
    expect(safeMarkdownHref("https://example.com/guide")).toBe("https://example.com/guide");
    expect(safeMarkdownHref("javascript:alert(1)")).toBeNull();
    expect(safeMarkdownHref("//evil.example/path")).toBeNull();
    expect(safeMarkdownHref("/\\\\evil.example/path")).toBeNull();
    expect(safeMarkdownHref("data:text/html,x")).toBeNull();
  });

  it("persists ported fields while forcing new articles to DRAFT", async () => {
    mocks.articleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "article-1",
      slug: data.slug,
      status: data.status,
    }));

    await createBlogArticle({
      actorUserId: "admin-1",
      slug: "cargo-guide",
      title: "화물차 운영 가이드",
      contentMarkdown: "본문",
      categoryId: "cat-1",
      tags: "지입, 화물차",
      featuredImageUrl: "https://example.com/truck.jpg",
      featuredImageAlt: "화물차 이미지",
    });

    expect(mocks.articleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          publishedAt: null,
          tags: ["지입", "화물차"],
          featuredImageUrl: "https://example.com/truck.jpg",
          featuredImageAlt: "화물차 이미지",
        }),
      }),
    );
  });

  it("treats ARCHIVED as terminal and never republishes it", async () => {
    mocks.articleFindUnique.mockResolvedValue({
      id: "article-1",
      slug: "cargo-guide",
      title: "화물차 운영 가이드",
      excerpt: null,
      contentMarkdown: "본문",
      seoTitle: null,
      seoDescription: null,
      tags: [],
      featuredImageUrl: null,
      featuredImageAlt: null,
      status: "ARCHIVED",
      publishedAt: null,
      categoryId: null,
    });

    await expect(
      setBlogArticleStatus({ actorUserId: "admin-1", articleId: "article-1", status: "PUBLISHED" }),
    ).rejects.toThrow("BLOG_ARTICLE_ARCHIVED");
    expect(mocks.articleUpdate).not.toHaveBeenCalled();
  });
});
