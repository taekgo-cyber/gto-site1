import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  articleFindUnique: vi.fn(),
  articleUpdate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.userFindUnique },
  blogArticle: { findUnique: mocks.articleFindUnique, update: mocks.articleUpdate },
  blogCategory: { findUnique: vi.fn() },
} }));
import { scheduleBlogArticlePublication } from "@/lib/blog/service";

const now = new Date("2026-08-24T00:00:00.000Z");

describe("Blog S20 reviewed publish scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null });
    mocks.articleFindUnique.mockResolvedValue({ id: "article-1", status: "DRAFT", slug: "safe-draft", title: "검수된 초안", excerpt: null, contentMarkdown: "충분한 본문", seoTitle: null, seoDescription: null, tags: [], featuredImageUrl: null, featuredImageAlt: null, categoryId: null });
    mocks.articleUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "article-1", ...data }));
  });

  it("stores a future publication time only after an active admin schedules a DRAFT", async () => {
    const publishAt = new Date("2026-08-25T00:00:00.000Z");
    const result = await scheduleBlogArticlePublication({ actorUserId: "admin-1", articleId: "article-1", publishAt, now });
    expect(result).toEqual(expect.objectContaining({ status: "PUBLISHED", publishedAt: publishAt }));
  });

  it("rejects past schedules before article mutation", async () => {
    await expect(scheduleBlogArticlePublication({ actorUserId: "admin-1", articleId: "article-1", publishAt: now, now })).rejects.toThrow("BLOG_PUBLISH_SCHEDULE_INVALID");
    expect(mocks.articleUpdate).not.toHaveBeenCalled();
  });
});
