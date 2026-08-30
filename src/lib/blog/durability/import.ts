import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  articleContentChecksumPayload,
  articleStateChecksumPayload,
  categoryChecksumPayload,
  checksumBlogDurabilityJson,
  deriveFeaturedImageRef,
  extractBodyImageRefs,
  stableBlogDurabilityJson,
  type BlogDurabilityArticleEntry,
  type BlogDurabilityBundleV1,
} from "./bundle-v1";
import {
  dryRunBlogDurabilityImportV1,
  type BlogDurabilityDryRunReport,
  type BlogDurabilityImageTransform,
} from "./dry-run";

type Gate6Environment = "local" | "test" | "disposable";

type ArticleReadBack = {
  slug: string;
  title: string;
  excerpt: string | null;
  contentMarkdown: string;
  tags: unknown;
  category: { slug: string } | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: Date | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  contentOrigin: "MANUAL" | "AI";
  aiGenerationMeta: unknown;
  authorId: string | null;
  automationJobId: string | null;
};

export type BlogDurabilityImportReport = {
  environment: Gate6Environment | "production";
  committed: true;
  dryRun: BlogDurabilityDryRunReport;
  createdCategorySlugs: string[];
  reusedCategorySlugs: string[];
  createdArticleSlugs: string[];
  noOpArticleSlugs: string[];
  postCommitVerified: true;
};

function assertGate6DatabaseBoundary(environment: Gate6Environment): void {
  if (!(["local", "test", "disposable"] as const).includes(environment)) {
    throw new Error("BLOG_DURABILITY_GATE6_ENVIRONMENT_INVALID");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("BLOG_DURABILITY_GATE6_DATABASE_URL_REQUIRED");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOG_DURABILITY_GATE6_DATABASE_URL_INVALID");
  }

  if (!(["postgres:", "postgresql:"] as const).includes(parsed.protocol as "postgres:" | "postgresql:")) {
    throw new Error("BLOG_DURABILITY_GATE6_DATABASE_URL_INVALID");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") {
    throw new Error("BLOG_DURABILITY_GATE6_NON_LOOPBACK_DATABASE_FORBIDDEN");
  }
}

function applyDryRunImageTransforms(
  article: BlogDurabilityArticleEntry,
  transforms: BlogDurabilityImageTransform[],
): BlogDurabilityArticleEntry {
  const forArticle = transforms.filter((entry) => entry.articleSlug === article.slug);
  const featured = forArticle.find((entry) => entry.kind === "featured");
  let contentMarkdown = article.contentMarkdown;
  for (const transform of forArticle.filter((entry) => entry.kind === "body")) {
    const index = contentMarkdown.indexOf(transform.sourceUrl);
    if (index < 0) throw new Error("BLOG_DURABILITY_IMAGE_TRANSFORM_MISMATCH");
    contentMarkdown = `${contentMarkdown.slice(0, index)}${transform.targetUrl}${contentMarkdown.slice(index + transform.sourceUrl.length)}`;
  }
  const featuredImageUrl = article.featuredImageUrl
    ? featured?.targetUrl ?? (() => { throw new Error("BLOG_DURABILITY_IMAGE_TRANSFORM_MISMATCH"); })()
    : null;
  const transformed: BlogDurabilityArticleEntry = {
    ...article,
    contentMarkdown,
    featuredImageUrl,
    imageRefs: {
      featured: deriveFeaturedImageRef(featuredImageUrl, article.featuredImageAlt),
      body: extractBodyImageRefs(contentMarkdown),
    },
  };
  return transformed;
}

function expectedArticles(bundle: BlogDurabilityBundleV1, dryRun: BlogDurabilityDryRunReport): BlogDurabilityArticleEntry[] {
  return bundle.articles.map((article) => applyDryRunImageTransforms(article, dryRun.imageTransforms));
}

function articleContentChecksum(row: ArticleReadBack): string {
  if (!Array.isArray(row.tags) || row.tags.some((tag) => typeof tag !== "string")) {
    throw new Error("BLOG_DURABILITY_TARGET_TAGS_INVALID");
  }
  return checksumBlogDurabilityJson(
    articleContentChecksumPayload({
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      contentMarkdown: row.contentMarkdown,
      tags: [...row.tags] as string[],
      categorySlug: row.category?.slug ?? null,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      featuredImageUrl: row.featuredImageUrl,
      featuredImageAlt: row.featuredImageAlt,
      contentOrigin: row.contentOrigin,
      aiGenerationMeta: row.aiGenerationMeta as never,
    }),
  );
}

function articleStateChecksum(row: ArticleReadBack): string {
  if (row.status !== "DRAFT" && row.status !== "PUBLISHED") {
    throw new Error("BLOG_DURABILITY_TARGET_STATE_INVALID");
  }
  return checksumBlogDurabilityJson(
    articleStateChecksumPayload({
      slug: row.slug,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    }),
  );
}

function assertArticleReadBack(input: {
  row: ArticleReadBack | null;
  expected: BlogDurabilityArticleEntry;
  expectedContentChecksum: string;
  expectedStateChecksum?: string;
  actorUserId: string;
  requireDraftState?: boolean;
}): void {
  const { row, expected } = input;
  if (!row) throw new Error("BLOG_DURABILITY_IMPORT_READBACK_MISSING");
  if (articleContentChecksum(row) !== input.expectedContentChecksum) {
    throw new Error("BLOG_DURABILITY_IMPORT_CONTENT_CHECKSUM_MISMATCH");
  }
  if (row.authorId !== input.actorUserId) throw new Error("BLOG_DURABILITY_IMPORT_AUTHOR_MISMATCH");
  if (row.automationJobId !== null) throw new Error("BLOG_DURABILITY_IMPORT_AUTOMATION_RELATION_MISMATCH");
  if ((row.category?.slug ?? null) !== expected.categorySlug) throw new Error("BLOG_DURABILITY_IMPORT_CATEGORY_MISMATCH");

  const actualImageRefs = {
    featured: deriveFeaturedImageRef(row.featuredImageUrl, row.featuredImageAlt),
    body: extractBodyImageRefs(row.contentMarkdown),
  };
  if (stableBlogDurabilityJson(actualImageRefs) !== stableBlogDurabilityJson(expected.imageRefs)) {
    throw new Error("BLOG_DURABILITY_IMPORT_IMAGE_REFERENCE_MISMATCH");
  }

  if (input.requireDraftState) {
    if (row.status !== "DRAFT" || row.publishedAt !== null) {
      throw new Error("BLOG_DURABILITY_IMPORT_INTERMEDIATE_STATE_MISMATCH");
    }
  } else if (input.expectedStateChecksum && articleStateChecksum(row) !== input.expectedStateChecksum) {
    throw new Error("BLOG_DURABILITY_IMPORT_STATE_CHECKSUM_MISMATCH");
  }
}

const articleSelect = {
  slug: true,
  title: true,
  excerpt: true,
  contentMarkdown: true,
  tags: true,
  category: { select: { slug: true } },
  status: true,
  publishedAt: true,
  seoTitle: true,
  seoDescription: true,
  featuredImageUrl: true,
  featuredImageAlt: true,
  contentOrigin: true,
  aiGenerationMeta: true,
  authorId: true,
  automationJobId: true,
} as const;

export async function importBlogDurabilityBundleV1(input: {
  bundle: BlogDurabilityBundleV1;
  actorUserId: string;
  targetBaseUrl: string;
  environment: Gate6Environment;
}): Promise<BlogDurabilityImportReport> {
  assertGate6DatabaseBoundary(input.environment);

  const dryRun = await dryRunBlogDurabilityImportV1({
    bundle: input.bundle,
    actorUserId: input.actorUserId,
    targetBaseUrl: input.targetBaseUrl,
  });
  return executeValidatedBlogDurabilityImportV1({
    bundle: input.bundle,
    actorUserId: input.actorUserId,
    dryRun,
    environment: input.environment,
  });
}

export async function executeValidatedBlogDurabilityImportV1(input: {
  bundle: BlogDurabilityBundleV1;
  actorUserId: string;
  dryRun: BlogDurabilityDryRunReport;
  environment: Gate6Environment | "production";
}): Promise<BlogDurabilityImportReport> {
  const dryRun = input.dryRun;
  if (!dryRun.bundleValid || !dryRun.eligibleForWrite || dryRun.errors.length > 0) {
    throw new Error(`BLOG_DURABILITY_IMPORT_NOT_ELIGIBLE:${dryRun.errors.join(",") || "DRY_RUN_REJECTED"}`);
  }

  const transformedArticles = expectedArticles(input.bundle, dryRun);
  const expectedBySlug = new Map(transformedArticles.map((article) => [article.slug, article]));
  const dryArticleBySlug = new Map(dryRun.articles.map((article) => [article.slug, article]));
  const categoryBySlug = new Map(input.bundle.categories.map((category) => [category.slug, category]));

  const transactionResult = await prisma.$transaction(async (tx) => {
    const createdCategorySlugs: string[] = [];
    const reusedCategorySlugs: string[] = [];
    const categoryIdBySlug = new Map<string, string>();

    for (const decision of dryRun.categories) {
      const expected = categoryBySlug.get(decision.slug);
      if (!expected) throw new Error("BLOG_DURABILITY_IMPORT_CATEGORY_PLAN_INVALID");
      const existing = await tx.blogCategory.findUnique({
        where: { slug: decision.slug },
        select: { id: true, slug: true, name: true, description: true, isActive: true, sortOrder: true },
      });
      if (decision.action === "create") {
        if (existing) throw new Error("BLOG_DURABILITY_IMPORT_TARGET_DRIFT");
        const created = await tx.blogCategory.create({
          data: {
            slug: expected.slug,
            name: expected.name,
            description: expected.description,
            isActive: expected.isActive,
            sortOrder: expected.sortOrder,
          },
          select: { id: true },
        });
        categoryIdBySlug.set(expected.slug, created.id);
        createdCategorySlugs.push(expected.slug);
      } else if (decision.action === "reuse") {
        if (!existing || checksumBlogDurabilityJson(categoryChecksumPayload({ ...expected, ...existing })) !== expected.checksum) {
          throw new Error("BLOG_DURABILITY_IMPORT_TARGET_DRIFT");
        }
        categoryIdBySlug.set(expected.slug, existing.id);
        reusedCategorySlugs.push(expected.slug);
      } else {
        throw new Error("BLOG_DURABILITY_IMPORT_CONFLICT");
      }
    }

    const createdArticleSlugs: string[] = [];
    const noOpArticleSlugs: string[] = [];

    for (const decision of dryRun.articles) {
      const expected = expectedBySlug.get(decision.slug);
      const planned = dryArticleBySlug.get(decision.slug);
      if (!expected || !planned) throw new Error("BLOG_DURABILITY_IMPORT_ARTICLE_PLAN_INVALID");
      const existing = await tx.blogArticle.findUnique({ where: { slug: decision.slug }, select: articleSelect });

      if (decision.action === "noOp") {
        assertArticleReadBack({
          row: existing as ArticleReadBack | null,
          expected,
          expectedContentChecksum: planned.expectedTargetContentChecksum,
          expectedStateChecksum: planned.expectedTargetStateChecksum,
          actorUserId: input.actorUserId,
        });
        noOpArticleSlugs.push(decision.slug);
        continue;
      }
      if (decision.action !== "create") throw new Error("BLOG_DURABILITY_IMPORT_CONFLICT");
      if (existing) throw new Error("BLOG_DURABILITY_IMPORT_TARGET_DRIFT");

      const categoryId = expected.categorySlug ? categoryIdBySlug.get(expected.categorySlug) : undefined;
      if (expected.categorySlug && !categoryId) throw new Error("BLOG_DURABILITY_IMPORT_CATEGORY_MAPPING_MISSING");

      await tx.blogArticle.create({
        data: {
          slug: expected.slug,
          title: expected.title,
          excerpt: expected.excerpt,
          contentMarkdown: expected.contentMarkdown,
          tags: expected.tags,
          categoryId: categoryId ?? null,
          seoTitle: expected.seoTitle,
          seoDescription: expected.seoDescription,
          featuredImageUrl: expected.featuredImageUrl,
          featuredImageAlt: expected.featuredImageAlt,
          contentOrigin: expected.contentOrigin,
          aiGenerationMeta: expected.aiGenerationMeta === null ? Prisma.JsonNull : (expected.aiGenerationMeta as Prisma.InputJsonValue),
          authorId: input.actorUserId,
          automationJobId: null,
          status: "DRAFT",
          publishedAt: null,
        },
      });

      const intermediate = await tx.blogArticle.findUnique({ where: { slug: expected.slug }, select: articleSelect });
      assertArticleReadBack({
        row: intermediate as ArticleReadBack | null,
        expected,
        expectedContentChecksum: planned.expectedTargetContentChecksum,
        actorUserId: input.actorUserId,
        requireDraftState: true,
      });

      await tx.blogArticle.update({
        where: { slug: expected.slug },
        data: {
          status: expected.status,
          publishedAt: expected.publishedAt ? new Date(expected.publishedAt) : null,
        },
      });

      const finalRow = await tx.blogArticle.findUnique({ where: { slug: expected.slug }, select: articleSelect });
      assertArticleReadBack({
        row: finalRow as ArticleReadBack | null,
        expected,
        expectedContentChecksum: planned.expectedTargetContentChecksum,
        expectedStateChecksum: planned.expectedTargetStateChecksum,
        actorUserId: input.actorUserId,
      });
      createdArticleSlugs.push(expected.slug);
    }

    return {
      createdCategorySlugs: createdCategorySlugs.sort(),
      reusedCategorySlugs: reusedCategorySlugs.sort(),
      createdArticleSlugs: createdArticleSlugs.sort(),
      noOpArticleSlugs: noOpArticleSlugs.sort(),
    };
  });

  try {
    for (const expected of transformedArticles) {
      const planned = dryArticleBySlug.get(expected.slug);
      if (!planned) throw new Error("BLOG_DURABILITY_IMPORT_ARTICLE_PLAN_INVALID");
      const row = await prisma.blogArticle.findUnique({ where: { slug: expected.slug }, select: articleSelect });
      assertArticleReadBack({
        row: row as ArticleReadBack | null,
        expected,
        expectedContentChecksum: planned.expectedTargetContentChecksum,
        expectedStateChecksum: planned.expectedTargetStateChecksum,
        actorUserId: input.actorUserId,
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "UNKNOWN";
    throw new Error(`BLOG_DURABILITY_POST_COMMIT_MISMATCH:${detail}`);
  }

  return {
    environment: input.environment,
    committed: true,
    dryRun,
    ...transactionResult,
    postCommitVerified: true,
  };
}
