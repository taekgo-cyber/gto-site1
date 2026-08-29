import { prisma } from "@/lib/prisma";
import {
  articleContentChecksumPayload,
  articleStateChecksumPayload,
  checksumBlogDurabilityJson,
  deriveFeaturedImageRef,
  extractBodyImageRefs,
  normalizeBlogDurabilityJson,
  type BlogDurabilityArticleContent,
  type BlogDurabilityArticleEntry,
  type BlogDurabilityArticleState,
  type BlogDurabilityBundleV1,
  type BlogDurabilityCategoryEntry,
} from "./bundle-v1";
import { validateBlogDurabilityBundleV1 } from "./validate-v1";

const SOURCE_IMAGE_ORIGIN = "http://localhost:3000";
const SOURCE_IMAGE_PREFIX = `${SOURCE_IMAGE_ORIGIN}/images/blog/`;

type TargetCategoryRow = {
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

type TargetArticleRow = {
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

export type BlogDurabilityImageTransform = {
  articleSlug: string;
  kind: "featured" | "body";
  occurrence: number | null;
  sourceUrl: string;
  targetUrl: string;
};

export type BlogDurabilityDryRunReport = {
  bundleValid: boolean;
  eligibleForWrite: boolean;
  wouldWrite: false;
  categories: Array<{
    slug: string;
    action: "create" | "reuse" | "conflict";
    expectedChecksum: string;
    targetChecksum: string | null;
  }>;
  articles: Array<{
    slug: string;
    action: "create" | "noOp" | "conflict";
    reasons: string[];
    expectedTargetContentChecksum: string;
    expectedTargetStateChecksum: string;
    targetContentChecksum: string | null;
    targetStateChecksum: string | null;
  }>;
  authorMapping: {
    sourceAuthorIds: string[];
    targetActorUserId: string;
    targetActorValidated: boolean;
  };
  automationPolicy: {
    targetAutomationJobId: null;
    preservedSourceJobRefs: Array<{ articleSlug: string; sourceJobId: string }>;
  };
  imageTransforms: BlogDurabilityImageTransform[];
  checksumResults: {
    bundleChecksumValid: boolean;
    expectedTargetContentChecksums: Array<{ slug: string; checksum: string }>;
    expectedTargetStateChecksums: Array<{ slug: string; checksum: string }>;
  };
  warnings: string[];
  errors: string[];
  expectedBundleArticleCount: number;
  expectedBundleCountsByStatus: { DRAFT: number; PUBLISHED: number };
  expectedCreateCount: number;
  expectedNoOpCount: number;
  expectedCategoryCreateCount: number;
  expectedCategoryReuseCount: number;
};

export type TransformedBlogDurabilityArticle = {
  article: BlogDurabilityArticleEntry;
  expectedTargetContentChecksum: string;
  expectedTargetStateChecksum: string;
  imageTransforms: BlogDurabilityImageTransform[];
};

function parseTargetOrigin(raw: string): string {
  if (!raw || /[\\\u0000-\u001f\u007f]/.test(raw)) throw new Error("BLOG_DURABILITY_TARGET_ORIGIN_INVALID");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOG_DURABILITY_TARGET_ORIGIN_INVALID");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.origin === "null"
  ) {
    throw new Error("BLOG_DURABILITY_TARGET_ORIGIN_INVALID");
  }
  return parsed.origin;
}

function transformImageUrl(sourceUrl: string, targetOrigin: string): string {
  if (!sourceUrl.startsWith(SOURCE_IMAGE_PREFIX) || /[\\\u0000-\u001f\u007f]/.test(sourceUrl)) {
    throw new Error("BLOG_DURABILITY_SOURCE_IMAGE_URL_INVALID");
  }
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("BLOG_DURABILITY_SOURCE_IMAGE_URL_INVALID");
  }
  if (
    parsed.origin !== SOURCE_IMAGE_ORIGIN ||
    !parsed.pathname.startsWith("/images/blog/") ||
    parsed.pathname === "/images/blog/" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    decodedPathHasTraversal(parsed.pathname)
  ) {
    throw new Error("BLOG_DURABILITY_SOURCE_IMAGE_URL_INVALID");
  }
  return `${targetOrigin}${parsed.pathname}`;
}

function decodedPathHasTraversal(pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.split("/").includes("..") || /%2f|%5c/i.test(pathname);
  } catch {
    return true;
  }
}

function transformBodyMarkdown(input: {
  articleSlug: string;
  contentMarkdown: string;
  targetOrigin: string;
}): { contentMarkdown: string; transforms: BlogDurabilityImageTransform[] } {
  const transforms: BlogDurabilityImageTransform[] = [];
  let occurrence = 0;
  let inCodeFence = false;
  const parts = input.contentMarkdown.split(/(\r\n|\r|\n)/);
  const transformed = parts.map((rawLine, index) => {
    if (index % 2 === 1) return rawLine;
    const line = rawLine.trimEnd();
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
      return rawLine;
    }
    if (inCodeFence) return rawLine;
    const match = /^(\s*!\[[^\]]+\]\()([^)\s]+)(\)\s*)$/.exec(rawLine);
    if (!match) return rawLine;
    const targetUrl = transformImageUrl(match[2], input.targetOrigin);
    transforms.push({
      articleSlug: input.articleSlug,
      kind: "body",
      occurrence,
      sourceUrl: match[2],
      targetUrl,
    });
    occurrence += 1;
    return `${match[1]}${targetUrl}${match[3]}`;
  });
  return { contentMarkdown: transformed.join(""), transforms };
}

export function transformBlogDurabilityArticleForTarget(
  source: BlogDurabilityArticleEntry,
  targetBaseUrl: string,
): TransformedBlogDurabilityArticle {
  const targetOrigin = parseTargetOrigin(targetBaseUrl);
  const body = transformBodyMarkdown({
    articleSlug: source.slug,
    contentMarkdown: source.contentMarkdown,
    targetOrigin,
  });
  const imageTransforms = [...body.transforms];
  const featuredImageUrl = source.featuredImageUrl
    ? transformImageUrl(source.featuredImageUrl, targetOrigin)
    : null;
  if (source.featuredImageUrl && featuredImageUrl) {
    imageTransforms.unshift({
      articleSlug: source.slug,
      kind: "featured",
      occurrence: null,
      sourceUrl: source.featuredImageUrl,
      targetUrl: featuredImageUrl,
    });
  }

  const article: BlogDurabilityArticleEntry = {
    ...source,
    featuredImageUrl,
    contentMarkdown: body.contentMarkdown,
    imageRefs: {
      featured: deriveFeaturedImageRef(featuredImageUrl, source.featuredImageAlt),
      body: extractBodyImageRefs(body.contentMarkdown),
    },
  };
  if (
    article.featuredImageUrl?.includes("localhost") ||
    article.imageRefs.body.some((ref) => ref.url.includes("localhost"))
  ) {
    throw new Error("BLOG_DURABILITY_LOCALHOST_IMAGE_REMAINING");
  }

  return {
    article,
    expectedTargetContentChecksum: checksumBlogDurabilityJson(articleContentChecksumPayload(article)),
    expectedTargetStateChecksum: checksumBlogDurabilityJson(articleStateChecksumPayload(article)),
    imageTransforms,
  };
}

function categoryTargetChecksum(category: TargetCategoryRow): string {
  return checksumBlogDurabilityJson({
    slug: category.slug,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  });
}

function targetArticleIdentity(row: TargetArticleRow): {
  contentChecksum: string | null;
  stateChecksum: string | null;
  imageRefsValid: boolean;
  categorySlug: string | null;
} {
  try {
    if (!Array.isArray(row.tags) || row.tags.some((tag) => typeof tag !== "string")) {
      throw new Error("BLOG_DURABILITY_TARGET_TAGS_INVALID");
    }
    const aiGenerationMeta = normalizeBlogDurabilityJson(row.aiGenerationMeta);
    const content: BlogDurabilityArticleContent = {
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
      aiGenerationMeta,
    };
    const stateChecksum =
      row.status === "DRAFT" || row.status === "PUBLISHED"
        ? checksumBlogDurabilityJson(
            articleStateChecksumPayload({
              slug: row.slug,
              status: row.status,
              publishedAt: row.publishedAt?.toISOString() ?? null,
            } satisfies BlogDurabilityArticleState),
          )
        : null;
    deriveFeaturedImageRef(row.featuredImageUrl, row.featuredImageAlt);
    extractBodyImageRefs(row.contentMarkdown);
    return {
      contentChecksum: checksumBlogDurabilityJson(articleContentChecksumPayload(content)),
      stateChecksum,
      imageRefsValid: true,
      categorySlug: content.categorySlug,
    };
  } catch {
    return { contentChecksum: null, stateChecksum: null, imageRefsValid: false, categorySlug: row.category?.slug ?? null };
  }
}

function emptyReport(input: {
  actorUserId: string;
  bundle?: BlogDurabilityBundleV1;
  bundleValid: boolean;
  errors: string[];
}): BlogDurabilityDryRunReport {
  return {
    bundleValid: input.bundleValid,
    eligibleForWrite: false,
    wouldWrite: false,
    categories: [],
    articles: [],
    authorMapping: { sourceAuthorIds: [], targetActorUserId: input.actorUserId, targetActorValidated: false },
    automationPolicy: { targetAutomationJobId: null, preservedSourceJobRefs: [] },
    imageTransforms: [],
    checksumResults: {
      bundleChecksumValid: input.bundleValid,
      expectedTargetContentChecksums: [],
      expectedTargetStateChecksums: [],
    },
    warnings: [],
    errors: [...input.errors].sort(),
    expectedBundleArticleCount: input.bundle?.summary.articleCount ?? 0,
    expectedBundleCountsByStatus: input.bundle?.summary.countsByStatus ?? { DRAFT: 0, PUBLISHED: 0 },
    expectedCreateCount: 0,
    expectedNoOpCount: 0,
    expectedCategoryCreateCount: 0,
    expectedCategoryReuseCount: 0,
  };
}

export async function dryRunBlogDurabilityImportV1(input: {
  bundle: unknown;
  actorUserId: string;
  targetBaseUrl: string;
}): Promise<BlogDurabilityDryRunReport> {
  const validation = validateBlogDurabilityBundleV1(input.bundle);
  if (!validation.bundle || validation.errors.length > 0) {
    return emptyReport({
      actorUserId: input.actorUserId,
      bundle: validation.bundle ?? undefined,
      bundleValid: false,
      errors: validation.errors,
    });
  }
  const bundle = validation.bundle;

  let transformedArticles: TransformedBlogDurabilityArticle[];
  try {
    transformedArticles = bundle.articles.map((article) =>
      transformBlogDurabilityArticleForTarget(article, input.targetBaseUrl),
    );
  } catch (error) {
    return emptyReport({
      actorUserId: input.actorUserId,
      bundle,
      bundleValid: true,
      errors: [error instanceof Error ? error.message : "BLOG_DURABILITY_IMAGE_TRANSFORM_INVALID"],
    });
  }

  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, role: true, status: true, deletedAt: true },
  });
  if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE" || actor.deletedAt) {
    return emptyReport({ actorUserId: input.actorUserId, bundle, bundleValid: true, errors: ["ADMIN_REQUIRED"] });
  }

  const [targetCategories, targetArticles] = await Promise.all([
    prisma.blogCategory.findMany({
      where: { slug: { in: bundle.categories.map((category) => category.slug) } },
      select: { slug: true, name: true, description: true, isActive: true, sortOrder: true },
      orderBy: { slug: "asc" },
    }),
    prisma.blogArticle.findMany({
      where: { slug: { in: bundle.articles.map((article) => article.slug) } },
      select: {
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
      },
      orderBy: { slug: "asc" },
    }),
  ]);

  const targetCategoryBySlug = new Map(
    (targetCategories as TargetCategoryRow[]).map((category) => [category.slug, category]),
  );
  const categories = bundle.categories.map((category: BlogDurabilityCategoryEntry) => {
    const target = targetCategoryBySlug.get(category.slug);
    const targetChecksum = target ? categoryTargetChecksum(target) : null;
    return {
      slug: category.slug,
      action: !target ? ("create" as const) : targetChecksum === category.checksum ? ("reuse" as const) : ("conflict" as const),
      expectedChecksum: category.checksum,
      targetChecksum,
    };
  });

  const targetArticleBySlug = new Map(
    (targetArticles as TargetArticleRow[]).map((article) => [article.slug, article]),
  );
  const articles = transformedArticles.map((transformed) => {
    const target = targetArticleBySlug.get(transformed.article.slug);
    if (!target) {
      return {
        slug: transformed.article.slug,
        action: "create" as const,
        reasons: [],
        expectedTargetContentChecksum: transformed.expectedTargetContentChecksum,
        expectedTargetStateChecksum: transformed.expectedTargetStateChecksum,
        targetContentChecksum: null,
        targetStateChecksum: null,
      };
    }

    const identity = targetArticleIdentity(target);
    const reasons: string[] = [];
    if (identity.contentChecksum !== transformed.expectedTargetContentChecksum) reasons.push("CONTENT_CHECKSUM_MISMATCH");
    if (identity.stateChecksum !== transformed.expectedTargetStateChecksum) reasons.push("STATE_CHECKSUM_MISMATCH");
    if (target.authorId !== input.actorUserId) reasons.push("AUTHOR_MISMATCH");
    if (target.automationJobId !== null) reasons.push("AUTOMATION_RELATION_MISMATCH");
    if (identity.categorySlug !== transformed.article.categorySlug) reasons.push("CATEGORY_RELATION_MISMATCH");
    if (!identity.imageRefsValid) reasons.push("IMAGE_REFERENCE_INVALID");
    return {
      slug: transformed.article.slug,
      action: reasons.length === 0 ? ("noOp" as const) : ("conflict" as const),
      reasons: reasons.sort(),
      expectedTargetContentChecksum: transformed.expectedTargetContentChecksum,
      expectedTargetStateChecksum: transformed.expectedTargetStateChecksum,
      targetContentChecksum: identity.contentChecksum,
      targetStateChecksum: identity.stateChecksum,
    };
  });

  const sourceAuthorIds = [
    ...new Set(bundle.articles.flatMap((article) => (article.source.authorRef ? [article.source.authorRef.sourceId] : []))),
  ].sort((left, right) => left.localeCompare(right, "en"));
  const preservedSourceJobRefs = bundle.articles
    .flatMap((article) =>
      article.source.automationJobRef
        ? [{ articleSlug: article.slug, sourceJobId: article.source.automationJobRef.sourceJobId }]
        : [],
    )
    .sort((left, right) => left.articleSlug.localeCompare(right.articleSlug, "en"));
  const imageTransforms = transformedArticles.flatMap((article) => article.imageTransforms);
  const hasConflict =
    categories.some((category) => category.action === "conflict") ||
    articles.some((article) => article.action === "conflict");
  const errors = hasConflict ? ["BLOG_DURABILITY_TARGET_CONFLICT"] : [];

  return {
    bundleValid: true,
    eligibleForWrite: !hasConflict,
    wouldWrite: false,
    categories,
    articles,
    authorMapping: { sourceAuthorIds, targetActorUserId: input.actorUserId, targetActorValidated: true },
    automationPolicy: { targetAutomationJobId: null, preservedSourceJobRefs },
    imageTransforms,
    checksumResults: {
      bundleChecksumValid: true,
      expectedTargetContentChecksums: transformedArticles.map((entry) => ({
        slug: entry.article.slug,
        checksum: entry.expectedTargetContentChecksum,
      })),
      expectedTargetStateChecksums: transformedArticles.map((entry) => ({
        slug: entry.article.slug,
        checksum: entry.expectedTargetStateChecksum,
      })),
    },
    warnings: preservedSourceJobRefs.length > 0 ? ["BLOG_DURABILITY_AUTOMATION_RELATION_DROPPED"] : [],
    errors,
    expectedBundleArticleCount: bundle.summary.articleCount,
    expectedBundleCountsByStatus: bundle.summary.countsByStatus,
    expectedCreateCount: articles.filter((article) => article.action === "create").length,
    expectedNoOpCount: articles.filter((article) => article.action === "noOp").length,
    expectedCategoryCreateCount: categories.filter((category) => category.action === "create").length,
    expectedCategoryReuseCount: categories.filter((category) => category.action === "reuse").length,
  };
}
