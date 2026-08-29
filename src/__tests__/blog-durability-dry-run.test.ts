import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  articleFindMany: vi.fn(),
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  articleCreate: vi.fn(),
  articleUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    blogCategory: {
      findMany: mocks.categoryFindMany,
      create: mocks.categoryCreate,
      update: mocks.categoryUpdate,
    },
    blogArticle: {
      findMany: mocks.articleFindMany,
      create: mocks.articleCreate,
      update: mocks.articleUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  dryRunBlogDurabilityImportV1,
  transformBlogDurabilityArticleForTarget,
} from "@/lib/blog/durability/dry-run";
import {
  buildBlogDurabilityBundleV1,
  type BlogDurabilitySourceRow,
} from "@/lib/blog/durability/export";
import { validateBlogDurabilityBundleV1 } from "@/lib/blog/durability/validate-v1";

const exportedAt = new Date("2026-08-30T00:00:00.000Z");
const source = {
  environmentLabel: "gate5-test",
  branch: "codex/s24-launch-validation",
  head: "5cd20df992fb91cc4b28a7ae49cd7b969b557a49",
  exporterVersion: "1",
};

function category() {
  return {
    id: "category-guides",
    slug: "guides",
    name: "운송 가이드",
    description: "운송 실무 가이드",
    isActive: true,
    sortOrder: 1,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  };
}

function sourceRow(overrides: Partial<BlogDurabilitySourceRow> = {}): BlogDurabilitySourceRow {
  return {
    id: "article-guide-one",
    slug: "guide-one",
    title: "운송 가이드",
    excerpt: "운송 가이드 요약",
    contentMarkdown:
      "본문\r\n\r\n![본문 이미지](http://localhost:3000/images/blog/guide-one-body.webp)\r\n",
    tags: ["운송", "가이드"],
    featuredImageUrl: "http://localhost:3000/images/blog/guide-one-featured.webp",
    featuredImageAlt: "운송 가이드 대표 이미지",
    contentOrigin: "AI",
    aiGenerationMeta: { provider: "test", nested: { approved: true } },
    automationJobId: "source-job-1",
    status: "DRAFT",
    seoTitle: "운송 가이드 SEO",
    seoDescription: "운송 가이드 SEO 설명",
    publishedAt: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    authorId: "source-author-1",
    category: category(),
    ...overrides,
  };
}

function bundle(overrides: Partial<BlogDurabilitySourceRow> = {}) {
  return buildBlogDurabilityBundleV1({ rows: [sourceRow(overrides)], exportedAt, source });
}

function activeAdmin() {
  return { id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null };
}

function targetArticle() {
  const transformed = transformBlogDurabilityArticleForTarget(bundle().articles[0], "https://www.example.com");
  return {
    slug: transformed.article.slug,
    title: transformed.article.title,
    excerpt: transformed.article.excerpt,
    contentMarkdown: transformed.article.contentMarkdown,
    tags: transformed.article.tags,
    category: { slug: "guides" },
    status: transformed.article.status,
    publishedAt: null,
    seoTitle: transformed.article.seoTitle,
    seoDescription: transformed.article.seoDescription,
    featuredImageUrl: transformed.article.featuredImageUrl,
    featuredImageAlt: transformed.article.featuredImageAlt,
    contentOrigin: transformed.article.contentOrigin,
    aiGenerationMeta: transformed.article.aiGenerationMeta,
    authorId: "admin-1",
    automationJobId: null,
  };
}

function expectNoWrites() {
  expect(mocks.categoryCreate).not.toHaveBeenCalled();
  expect(mocks.categoryUpdate).not.toHaveBeenCalled();
  expect(mocks.articleCreate).not.toHaveBeenCalled();
  expect(mocks.articleUpdate).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
}

describe("Blog Durability Gate 5 bundle validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts the deterministic Gate 4 bundle and validates its derived references", () => {
    expect(validateBlogDurabilityBundleV1(bundle())).toEqual({ bundle: bundle(), errors: [] });
  });

  it("fails closed on checksum tampering before any database read", async () => {
    const tampered = structuredClone(bundle());
    tampered.articles[0].title = "변조된 제목";

    const report = await dryRunBlogDurabilityImportV1({
      bundle: tampered,
      actorUserId: "admin-1",
      targetBaseUrl: "https://www.example.com",
    });

    expect(report).toMatchObject({
      bundleValid: false,
      eligibleForWrite: false,
      wouldWrite: false,
      errors: expect.arrayContaining(["BLOG_DURABILITY_BUNDLE_CHECKSUM_INVALID"]),
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.categoryFindMany).not.toHaveBeenCalled();
    expect(mocks.articleFindMany).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("rejects an unknown schema version before any database read", async () => {
    const unknownVersion = { ...bundle(), schemaVersion: 2 };
    const report = await dryRunBlogDurabilityImportV1({
      bundle: unknownVersion,
      actorUserId: "admin-1",
      targetBaseUrl: "https://www.example.com",
    });
    expect(report.errors).toEqual(["BLOG_DURABILITY_BUNDLE_STRUCTURE_INVALID"]);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("Blog Durability Gate 5 URL transformation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves non-image Markdown bytes and reports featured/body mappings", () => {
    const article = bundle().articles[0];
    const transformed = transformBlogDurabilityArticleForTarget(article, "https://cdn.example.com");

    expect(transformed.article.contentMarkdown).toBe(
      "본문\r\n\r\n![본문 이미지](https://cdn.example.com/images/blog/guide-one-body.webp)\r\n",
    );
    expect(transformed.article.featuredImageUrl).toBe(
      "https://cdn.example.com/images/blog/guide-one-featured.webp",
    );
    expect(transformed.imageTransforms).toEqual([
      {
        articleSlug: "guide-one",
        kind: "featured",
        occurrence: null,
        sourceUrl: "http://localhost:3000/images/blog/guide-one-featured.webp",
        targetUrl: "https://cdn.example.com/images/blog/guide-one-featured.webp",
      },
      {
        articleSlug: "guide-one",
        kind: "body",
        occurrence: 0,
        sourceUrl: "http://localhost:3000/images/blog/guide-one-body.webp",
        targetUrl: "https://cdn.example.com/images/blog/guide-one-body.webp",
      },
    ]);
  });

  it.each([
    "http://cdn.example.com",
    "https://user:pass@cdn.example.com",
    "https://cdn.example.com/path",
    "https://cdn.example.com?query=1",
    "https://cdn.example.com/#fragment",
  ])("rejects unsafe target origin %s before database access", async (targetBaseUrl) => {
    const report = await dryRunBlogDurabilityImportV1({
      bundle: bundle(),
      actorUserId: "admin-1",
      targetBaseUrl,
    });
    expect(report.errors).toEqual(["BLOG_DURABILITY_TARGET_ORIGIN_INVALID"]);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("rejects a non-canonical source image origin before database access", async () => {
    const report = await dryRunBlogDurabilityImportV1({
      bundle: bundle({ featuredImageUrl: "https://other.example.com/images/blog/featured.webp" }),
      actorUserId: "admin-1",
      targetBaseUrl: "https://cdn.example.com",
    });
    expect(report.errors).toEqual(["BLOG_DURABILITY_SOURCE_IMAGE_URL_INVALID"]);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("Blog Durability Gate 5 read-only target reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue(activeAdmin());
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.articleFindMany.mockResolvedValue([]);
  });

  it("reports missing rows as create candidates without writing", async () => {
    const report = await dryRunBlogDurabilityImportV1({
      bundle: bundle(),
      actorUserId: "admin-1",
      targetBaseUrl: "https://www.example.com",
    });

    expect(report).toMatchObject({
      bundleValid: true,
      eligibleForWrite: true,
      wouldWrite: false,
      expectedBundleArticleCount: 1,
      expectedBundleCountsByStatus: { DRAFT: 1, PUBLISHED: 0 },
      expectedCreateCount: 1,
      expectedNoOpCount: 0,
      expectedCategoryCreateCount: 1,
      expectedCategoryReuseCount: 0,
      categories: [{ slug: "guides", action: "create" }],
      articles: [{ slug: "guide-one", action: "create", reasons: [] }],
      authorMapping: {
        sourceAuthorIds: ["source-author-1"],
        targetActorUserId: "admin-1",
        targetActorValidated: true,
      },
      automationPolicy: {
        targetAutomationJobId: null,
        preservedSourceJobRefs: [{ articleSlug: "guide-one", sourceJobId: "source-job-1" }],
      },
      warnings: ["BLOG_DURABILITY_AUTOMATION_RELATION_DROPPED"],
      errors: [],
    });
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.categoryFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.articleFindMany).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it("reports checksum-identical rows as reuse/no-op without writing", async () => {
    mocks.categoryFindMany.mockResolvedValue([
      { slug: "guides", name: "운송 가이드", description: "운송 실무 가이드", isActive: true, sortOrder: 1 },
    ]);
    mocks.articleFindMany.mockResolvedValue([targetArticle()]);

    const report = await dryRunBlogDurabilityImportV1({
      bundle: bundle(),
      actorUserId: "admin-1",
      targetBaseUrl: "https://www.example.com",
    });

    expect(report.eligibleForWrite).toBe(true);
    expect(report.categories[0].action).toBe("reuse");
    expect(report.articles[0]).toMatchObject({ action: "noOp", reasons: [] });
    expect(report.expectedCreateCount).toBe(0);
    expect(report.expectedNoOpCount).toBe(1);
    expect(report.expectedCategoryReuseCount).toBe(1);
    expectNoWrites();
  });

  it("reports semantic, author, and automation conflicts without writing", async () => {
    mocks.categoryFindMany.mockResolvedValue([
      { slug: "guides", name: "다른 이름", description: "운송 실무 가이드", isActive: true, sortOrder: 1 },
    ]);
    mocks.articleFindMany.mockResolvedValue([
      { ...targetArticle(), authorId: "other-admin", automationJobId: "target-job" },
    ]);

    const report = await dryRunBlogDurabilityImportV1({
      bundle: bundle(),
      actorUserId: "admin-1",
      targetBaseUrl: "https://www.example.com",
    });

    expect(report.eligibleForWrite).toBe(false);
    expect(report.categories[0].action).toBe("conflict");
    expect(report.articles[0]).toMatchObject({
      action: "conflict",
      reasons: ["AUTHOR_MISMATCH", "AUTOMATION_RELATION_MISMATCH"],
    });
    expect(report.errors).toEqual(["BLOG_DURABILITY_TARGET_CONFLICT"]);
    expectNoWrites();
  });

  it("stops after the read-only actor check when ACTIVE ADMIN authorization fails", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "SUSPENDED", deletedAt: null });
    const report = await dryRunBlogDurabilityImportV1({
      bundle: bundle(),
      actorUserId: "admin-1",
      targetBaseUrl: "https://www.example.com",
    });

    expect(report.errors).toEqual(["ADMIN_REQUIRED"]);
    expect(report.authorMapping.targetActorValidated).toBe(false);
    expect(mocks.categoryFindMany).not.toHaveBeenCalled();
    expect(mocks.articleFindMany).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
