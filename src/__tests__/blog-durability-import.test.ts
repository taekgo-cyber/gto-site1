import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  articleContentChecksumPayload,
  articleStateChecksumPayload,
  checksumBlogDurabilityJson,
  type BlogDurabilityArticleEntry,
  type BlogDurabilityBundleV1,
} from "@/lib/blog/durability/bundle-v1";

const mocks = vi.hoisted(() => ({
  dryRun: vi.fn(),
  transaction: vi.fn(),
  rootArticleFindUnique: vi.fn(),
  categoryFindUnique: vi.fn(),
  categoryCreate: vi.fn(),
  articleFindUnique: vi.fn(),
  articleCreate: vi.fn(),
  articleUpdate: vi.fn(),
}));

vi.mock("@/lib/blog/durability/dry-run", () => ({
  dryRunBlogDurabilityImportV1: mocks.dryRun,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    blogArticle: { findUnique: mocks.rootArticleFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { importBlogDurabilityBundleV1 } from "@/lib/blog/durability/import";

const category = {
  slug: "guides",
  name: "Guides",
  description: "Guides category",
  isActive: true,
  sortOrder: 1,
  source: { id: "source-category", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" },
  checksum: "",
};
category.checksum = checksumBlogDurabilityJson({
  slug: category.slug,
  name: category.name,
  description: category.description,
  isActive: category.isActive,
  sortOrder: category.sortOrder,
});

const sourceArticle: BlogDurabilityArticleEntry = {
  slug: "guide-one",
  title: "Guide One",
  excerpt: "Guide summary",
  contentMarkdown: "Body\n\n![Body](http://localhost:3000/images/blog/guide-one-body.webp)\n",
  tags: ["guide"],
  categorySlug: "guides",
  seoTitle: "Guide SEO",
  seoDescription: "Guide SEO description",
  featuredImageUrl: "http://localhost:3000/images/blog/guide-one-featured.webp",
  featuredImageAlt: "Featured",
  contentOrigin: "AI",
  aiGenerationMeta: { provider: "test" },
  status: "PUBLISHED",
  publishedAt: "2026-08-20T01:02:03.000Z",
  imageRefs: {
    featured: { url: "http://localhost:3000/images/blog/guide-one-featured.webp", alt: "Featured", assetPath: "/images/blog/guide-one-featured.webp" },
    body: [{ url: "http://localhost:3000/images/blog/guide-one-body.webp", alt: "Body", assetPath: "/images/blog/guide-one-body.webp", occurrence: 0 }],
  },
  source: {
    id: "source-article",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    authorRef: { sourceId: "source-author" },
    automationJobRef: null,
  },
  checksums: { contentChecksum: "source-content", stateChecksum: "source-state" },
};

const bundle: BlogDurabilityBundleV1 = {
  format: "gto.blog-durability",
  schemaVersion: 1,
  exportedAt: "2026-08-30T00:00:00.000Z",
  source: { environmentLabel: "gate6-test", branch: "test", head: "head", exporterVersion: "1" },
  selection: { articleSlugs: ["guide-one"], includedStatuses: ["DRAFT", "PUBLISHED"] },
  categories: [category],
  articles: [sourceArticle],
  checksums: { algorithm: "sha256", canonicalization: "gto-stable-json-v1", bundleChecksum: "bundle" },
  summary: { categoryCount: 1, articleCount: 1, countsByStatus: { DRAFT: 0, PUBLISHED: 1 }, featuredImageRefCount: 1, bodyImageRefCount: 1, excludedArchivedCount: 0, excludedArchivedSlugs: [] },
};

const transformedArticle: BlogDurabilityArticleEntry = {
  ...sourceArticle,
  contentMarkdown: "Body\n\n![Body](https://www.example.com/images/blog/guide-one-body.webp)\n",
  featuredImageUrl: "https://www.example.com/images/blog/guide-one-featured.webp",
  imageRefs: {
    featured: { url: "https://www.example.com/images/blog/guide-one-featured.webp", alt: "Featured", assetPath: "/images/blog/guide-one-featured.webp" },
    body: [{ url: "https://www.example.com/images/blog/guide-one-body.webp", alt: "Body", assetPath: "/images/blog/guide-one-body.webp", occurrence: 0 }],
  },
};

const targetContentChecksum = checksumBlogDurabilityJson(articleContentChecksumPayload(transformedArticle));
const targetStateChecksum = checksumBlogDurabilityJson(articleStateChecksumPayload(transformedArticle));

function dryRun(action: "create" | "noOp", categoryAction: "create" | "reuse" = "create") {
  return {
    bundleValid: true,
    eligibleForWrite: true,
    wouldWrite: false,
    categories: [{ slug: "guides", action: categoryAction, expectedChecksum: category.checksum, targetChecksum: categoryAction === "reuse" ? category.checksum : null }],
    articles: [{ slug: "guide-one", action, reasons: [], expectedTargetContentChecksum: targetContentChecksum, expectedTargetStateChecksum: targetStateChecksum, targetContentChecksum: action === "noOp" ? targetContentChecksum : null, targetStateChecksum: action === "noOp" ? targetStateChecksum : null }],
    authorMapping: { sourceAuthorIds: ["source-author"], targetActorUserId: "admin-1", targetActorValidated: true },
    automationPolicy: { targetAutomationJobId: null, preservedSourceJobRefs: [] },
    imageTransforms: [
      { articleSlug: "guide-one", kind: "featured", occurrence: null, sourceUrl: sourceArticle.featuredImageUrl, targetUrl: transformedArticle.featuredImageUrl },
      { articleSlug: "guide-one", kind: "body", occurrence: 0, sourceUrl: "http://localhost:3000/images/blog/guide-one-body.webp", targetUrl: "https://www.example.com/images/blog/guide-one-body.webp" },
    ],
    checksumResults: { bundleChecksumValid: true, expectedTargetContentChecksums: [{ slug: "guide-one", checksum: targetContentChecksum }], expectedTargetStateChecksums: [{ slug: "guide-one", checksum: targetStateChecksum }] },
    warnings: [],
    errors: [],
    expectedBundleArticleCount: 1,
    expectedBundleCountsByStatus: { DRAFT: 0, PUBLISHED: 1 },
    expectedCreateCount: action === "create" ? 1 : 0,
    expectedNoOpCount: action === "noOp" ? 1 : 0,
    expectedCategoryCreateCount: categoryAction === "create" ? 1 : 0,
    expectedCategoryReuseCount: categoryAction === "reuse" ? 1 : 0,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    slug: transformedArticle.slug,
    title: transformedArticle.title,
    excerpt: transformedArticle.excerpt,
    contentMarkdown: transformedArticle.contentMarkdown,
    tags: transformedArticle.tags,
    category: { slug: "guides" },
    status: transformedArticle.status,
    publishedAt: new Date(transformedArticle.publishedAt!),
    seoTitle: transformedArticle.seoTitle,
    seoDescription: transformedArticle.seoDescription,
    featuredImageUrl: transformedArticle.featuredImageUrl,
    featuredImageAlt: transformedArticle.featuredImageAlt,
    contentOrigin: transformedArticle.contentOrigin,
    aiGenerationMeta: transformedArticle.aiGenerationMeta,
    authorId: "admin-1",
    automationJobId: null,
    ...overrides,
  };
}

describe("Blog Durability Gate 6 transactional importer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://gate6:gate6@127.0.0.1:5432/gate6_test";
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      blogCategory: { findUnique: mocks.categoryFindUnique, create: mocks.categoryCreate },
      blogArticle: { findUnique: mocks.articleFindUnique, create: mocks.articleCreate, update: mocks.articleUpdate },
    }));
  });

  it("fails closed before dry-run when DATABASE_URL is not loopback", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com:5432/prod";
    await expect(importBlogDurabilityBundleV1({ bundle, actorUserId: "admin-1", targetBaseUrl: "https://www.example.com", environment: "test" }))
      .rejects.toThrow("BLOG_DURABILITY_GATE6_NON_LOOPBACK_DATABASE_FORBIDDEN");
    expect(mocks.dryRun).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates missing rows as DRAFT, verifies them, applies final state last, and verifies post-commit", async () => {
    mocks.dryRun.mockResolvedValue(dryRun("create"));
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.categoryCreate.mockResolvedValue({ id: "category-target" });

    let current: ReturnType<typeof row> | null = null;
    mocks.articleFindUnique.mockImplementation(async () => current);
    mocks.articleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      current = row({ status: "DRAFT", publishedAt: null, ...data, category: { slug: "guides" } });
      return { id: "article-target" };
    });
    mocks.articleUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      current = { ...current!, ...data };
      return { id: "article-target" };
    });
    mocks.rootArticleFindUnique.mockImplementation(async () => current);

    const report = await importBlogDurabilityBundleV1({ bundle, actorUserId: "admin-1", targetBaseUrl: "https://www.example.com", environment: "disposable" });

    expect(report).toMatchObject({ committed: true, createdCategorySlugs: ["guides"], createdArticleSlugs: ["guide-one"], noOpArticleSlugs: [], postCommitVerified: true });
    expect(mocks.articleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", publishedAt: null, authorId: "admin-1", automationJobId: null }) }));
    expect(mocks.articleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PUBLISHED", publishedAt: new Date("2026-08-20T01:02:03.000Z") } }));
  });

  it("keeps checksum-identical existing rows as NO_OP without writes", async () => {
    mocks.dryRun.mockResolvedValue(dryRun("noOp", "reuse"));
    mocks.categoryFindUnique.mockResolvedValue({ id: "category-target", slug: "guides", name: "Guides", description: "Guides category", isActive: true, sortOrder: 1 });
    mocks.articleFindUnique.mockResolvedValue(row());
    mocks.rootArticleFindUnique.mockResolvedValue(row());

    const report = await importBlogDurabilityBundleV1({ bundle, actorUserId: "admin-1", targetBaseUrl: "https://www.example.com", environment: "test" });

    expect(report.noOpArticleSlugs).toEqual(["guide-one"]);
    expect(report.reusedCategorySlugs).toEqual(["guides"]);
    expect(mocks.categoryCreate).not.toHaveBeenCalled();
    expect(mocks.articleCreate).not.toHaveBeenCalled();
    expect(mocks.articleUpdate).not.toHaveBeenCalled();
  });

  it("throws inside the bounded transaction when intermediate content verification fails", async () => {
    mocks.dryRun.mockResolvedValue(dryRun("create"));
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.categoryCreate.mockResolvedValue({ id: "category-target" });
    let current: ReturnType<typeof row> | null = null;
    mocks.articleFindUnique.mockImplementation(async () => current);
    mocks.articleCreate.mockImplementation(async () => {
      current = row({ title: "CORRUPTED", status: "DRAFT", publishedAt: null });
      return { id: "article-target" };
    });

    await expect(importBlogDurabilityBundleV1({ bundle, actorUserId: "admin-1", targetBaseUrl: "https://www.example.com", environment: "local" }))
      .rejects.toThrow("BLOG_DURABILITY_IMPORT_CONTENT_CHECKSUM_MISMATCH");
    expect(mocks.articleUpdate).not.toHaveBeenCalled();
    expect(mocks.rootArticleFindUnique).not.toHaveBeenCalled();
  });

  it("treats a post-commit mismatch as a critical stop without compensating writes", async () => {
    mocks.dryRun.mockResolvedValue(dryRun("noOp", "reuse"));
    mocks.categoryFindUnique.mockResolvedValue({ id: "category-target", slug: "guides", name: "Guides", description: "Guides category", isActive: true, sortOrder: 1 });
    mocks.articleFindUnique.mockResolvedValue(row());
    mocks.rootArticleFindUnique.mockResolvedValue(row({ title: "POST_COMMIT_CORRUPTION" }));

    await expect(importBlogDurabilityBundleV1({ bundle, actorUserId: "admin-1", targetBaseUrl: "https://www.example.com", environment: "test" }))
      .rejects.toThrow("BLOG_DURABILITY_POST_COMMIT_MISMATCH:BLOG_DURABILITY_IMPORT_CONTENT_CHECKSUM_MISMATCH");
    expect(mocks.articleCreate).not.toHaveBeenCalled();
    expect(mocks.articleUpdate).not.toHaveBeenCalled();
  });
});
