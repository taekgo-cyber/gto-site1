import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ articleFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { blogArticle: { findMany: mocks.articleFindMany } },
}));

import {
  articleContentChecksumPayload,
  articleStateChecksumPayload,
  bundleChecksumPayload,
  checksumBlogDurabilityJson,
  extractBodyImageRefs,
  stableBlogDurabilityJson,
  verifyBlogDurabilityBundleChecksums,
} from "@/lib/blog/durability/bundle-v1";
import {
  buildBlogDurabilityBundleV1,
  exportBlogDurabilityBundleV1,
  type BlogDurabilitySourceRow,
} from "@/lib/blog/durability/export";

const fixedDate = new Date("2026-08-29T01:02:03.000Z");
const source = {
  environmentLabel: "test-local",
  branch: "codex/s24-launch-validation",
  head: "a926aeff231a6aaf14ca98b8265c6cf32544ac35",
  exporterVersion: "1",
};

function category(slug: string, sortOrder: number) {
  return {
    id: `category-${slug}`,
    slug,
    name: `Category ${slug}`,
    description: `${slug} description`,
    isActive: true,
    sortOrder,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  };
}

function row(input: {
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  categorySlug?: string | null;
  tags?: string[];
  publishedAt?: Date | null;
  bodyImages?: string;
}): BlogDurabilitySourceRow {
  const categorySlug = input.categorySlug === undefined ? "guides" : input.categorySlug;
  return {
    id: `article-${input.slug}`,
    slug: input.slug,
    title: `Title ${input.slug}`,
    excerpt: `Excerpt ${input.slug}`,
    contentMarkdown:
      input.bodyImages ?? `본문\n\n![${input.slug} body](http://localhost:3000/images/blog/${input.slug}-body.webp)`,
    tags: input.tags ?? ["second", "first"],
    featuredImageUrl: `http://localhost:3000/images/blog/${input.slug}-featured.webp`,
    featuredImageAlt: `${input.slug} featured`,
    contentOrigin: "AI",
    aiGenerationMeta: { z: 1, nested: { b: true, a: null } },
    automationJobId: `job-${input.slug}`,
    status: input.status,
    seoTitle: `SEO ${input.slug}`,
    seoDescription: `SEO description ${input.slug}`,
    publishedAt:
      input.publishedAt !== undefined
        ? input.publishedAt
        : input.status === "PUBLISHED"
          ? new Date("2026-08-20T00:00:00.000Z")
          : null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    authorId: `author-${input.slug}`,
    category: categorySlug ? category(categorySlug, categorySlug === "guides" ? 2 : 1) : null,
  };
}

describe("Blog Durability Bundle v1 canonicalization", () => {
  it("is independent of object insertion order and preserves array order", () => {
    const left = stableBlogDurabilityJson({ z: 1, a: { y: 2, x: 3 }, tags: ["b", "a"] });
    const right = stableBlogDurabilityJson({ tags: ["b", "a"], a: { x: 3, y: 2 }, z: 1 });
    expect(left).toBe(right);
    expect(checksumBlogDurabilityJson({ tags: ["b", "a"] })).not.toBe(
      checksumBlogDurabilityJson({ tags: ["a", "b"] }),
    );
  });

  it("keeps null distinct from absent and rejects non-JSON values", () => {
    expect(checksumBlogDurabilityJson({ value: null })).not.toBe(checksumBlogDurabilityJson({}));
    expect(() => stableBlogDurabilityJson({ value: undefined })).toThrow("BLOG_DURABILITY_JSON_INVALID");
    expect(() => stableBlogDurabilityJson({ value: BigInt(1) })).toThrow("BLOG_DURABILITY_JSON_INVALID");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stableBlogDurabilityJson(cyclic)).toThrow("BLOG_DURABILITY_JSON_CYCLIC");
  });
});

describe("Blog Durability image references", () => {
  it("extracts only renderer-supported block images in document order", () => {
    const markdown = [
      "문단 ![inline](https://example.com/inline.webp)",
      "![ first alt ](http://localhost:3000/images/blog/first.webp)",
      "```md",
      "![code](https://example.com/code.webp)",
      "```",
      "![second alt](https://example.com/second.webp)",
    ].join("\n");
    expect(extractBodyImageRefs(markdown)).toEqual([
      {
        url: "http://localhost:3000/images/blog/first.webp",
        alt: "first alt",
        assetPath: "/images/blog/first.webp",
        occurrence: 0,
      },
      {
        url: "https://example.com/second.webp",
        alt: "second alt",
        assetPath: "/second.webp",
        occurrence: 1,
      },
    ]);
  });

  it("rejects a malformed standalone image-like line", () => {
    expect(() => extractBodyImageRefs("![](https://example.com/no-alt.webp)")).toThrow(
      "BLOG_DURABILITY_BODY_IMAGE_INVALID",
    );
  });
});

describe("Blog Durability export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a deterministic, sorted operating bundle and accounts for archived rows", () => {
    const rows = [
      row({ slug: "z-archived", status: "ARCHIVED", categorySlug: "unused" }),
      row({ slug: "b-published", status: "PUBLISHED", categorySlug: "work" }),
      row({ slug: "a-draft", status: "DRAFT", categorySlug: "guides", tags: ["z", "a"] }),
    ];
    const bundle = buildBlogDurabilityBundleV1({ rows, exportedAt: fixedDate, source });
    const replay = buildBlogDurabilityBundleV1({ rows: [...rows].reverse(), exportedAt: fixedDate, source });

    expect(bundle).toEqual(replay);
    expect(bundle.selection.articleSlugs).toEqual(["a-draft", "b-published"]);
    expect(bundle.articles.map((article) => article.slug)).toEqual(["a-draft", "b-published"]);
    expect(bundle.categories.map((entry) => entry.slug)).toEqual(["guides", "work"]);
    expect(bundle.articles[0].tags).toEqual(["z", "a"]);
    expect(bundle.summary).toEqual({
      categoryCount: 2,
      articleCount: 2,
      countsByStatus: { DRAFT: 1, PUBLISHED: 1 },
      featuredImageRefCount: 2,
      bodyImageRefCount: 2,
      excludedArchivedCount: 1,
      excludedArchivedSlugs: ["z-archived"],
    });
    expect(bundle.categories.some((entry) => entry.slug === "unused")).toBe(false);
    expect(verifyBlogDurabilityBundleChecksums(bundle)).toBe(true);
  });

  it("separates portable content identity from publication state identity", () => {
    const bundle = buildBlogDurabilityBundleV1({
      rows: [row({ slug: "article-one", status: "DRAFT" })],
      exportedAt: fixedDate,
      source,
    });
    const article = bundle.articles[0];
    const changedState = { ...article, status: "PUBLISHED" as const, publishedAt: fixedDate.toISOString() };
    expect(checksumBlogDurabilityJson(articleContentChecksumPayload(changedState))).toBe(
      article.checksums.contentChecksum,
    );
    expect(checksumBlogDurabilityJson(articleStateChecksumPayload(changedState))).not.toBe(
      article.checksums.stateChecksum,
    );
  });

  it("excludes only the bundle checksum field when calculating the bundle digest", () => {
    const bundle = buildBlogDurabilityBundleV1({
      rows: [row({ slug: "article-one", status: "DRAFT" })],
      exportedAt: fixedDate,
      source,
    });
    expect(checksumBlogDurabilityJson(bundleChecksumPayload(bundle))).toBe(bundle.checksums.bundleChecksum);
    const tampered = structuredClone(bundle);
    tampered.articles[0].title = "tampered";
    expect(verifyBlogDurabilityBundleChecksums(tampered)).toBe(false);
  });

  it("rejects invalid DRAFT and PUBLISHED timestamp states", () => {
    expect(() =>
      buildBlogDurabilityBundleV1({
        rows: [row({ slug: "bad-draft", status: "DRAFT", publishedAt: fixedDate })],
        exportedAt: fixedDate,
        source,
      }),
    ).toThrow("BLOG_DURABILITY_DRAFT_PUBLISHED_AT_INVALID");
    expect(() =>
      buildBlogDurabilityBundleV1({
        rows: [row({ slug: "bad-published", status: "PUBLISHED", publishedAt: null })],
        exportedAt: fixedDate,
        source,
      }),
    ).toThrow("BLOG_DURABILITY_PUBLISHED_AT_REQUIRED");
  });

  it("uses only the Prisma read query and preserves source provenance", async () => {
    const rows = [row({ slug: "article-one", status: "DRAFT" })];
    mocks.articleFindMany.mockResolvedValue(rows);
    const bundle = await exportBlogDurabilityBundleV1({ exportedAt: fixedDate, source });

    expect(mocks.articleFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.articleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["DRAFT", "PUBLISHED", "ARCHIVED"] } },
        orderBy: { slug: "asc" },
      }),
    );
    expect(bundle.articles[0].source).toEqual({
      id: "article-article-one",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
      authorRef: { sourceId: "author-article-one" },
      automationJobRef: { sourceJobId: "job-article-one" },
    });
  });
});
