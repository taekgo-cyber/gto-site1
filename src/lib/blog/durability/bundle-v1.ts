import { createHash } from "node:crypto";

export const BLOG_DURABILITY_FORMAT = "gto.blog-durability" as const;
export const BLOG_DURABILITY_SCHEMA_VERSION = 1 as const;
export const BLOG_DURABILITY_CANONICALIZATION = "gto-stable-json-v1" as const;
export const BLOG_DURABILITY_CHECKSUM_ALGORITHM = "sha256" as const;

export type BlogDurabilityJson =
  | null
  | boolean
  | number
  | string
  | BlogDurabilityJson[]
  | { [key: string]: BlogDurabilityJson };

export type BlogDurabilitySourceMetadata = {
  environmentLabel: string;
  branch: string;
  head: string;
  exporterVersion: string;
};

export type BlogDurabilityImageRef = {
  url: string;
  alt: string;
  assetPath: string;
};

export type BlogDurabilityBodyImageRef = BlogDurabilityImageRef & {
  occurrence: number;
};

export type BlogDurabilityCategoryEntry = {
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  source: { id: string; createdAt: string; updatedAt: string };
  checksum: string;
};

export type BlogDurabilityArticleContent = {
  slug: string;
  title: string;
  excerpt: string | null;
  contentMarkdown: string;
  tags: string[];
  categorySlug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  contentOrigin: "MANUAL" | "AI";
  aiGenerationMeta: BlogDurabilityJson;
};

export type BlogDurabilityArticleState = {
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
};

export type BlogDurabilityArticleEntry = BlogDurabilityArticleContent &
  BlogDurabilityArticleState & {
    imageRefs: {
      featured: BlogDurabilityImageRef | null;
      body: BlogDurabilityBodyImageRef[];
    };
    source: {
      id: string;
      createdAt: string;
      updatedAt: string;
      authorRef: { sourceId: string } | null;
      automationJobRef: { sourceJobId: string } | null;
    };
    checksums: { contentChecksum: string; stateChecksum: string };
  };

export type BlogDurabilityBundleV1 = {
  format: typeof BLOG_DURABILITY_FORMAT;
  schemaVersion: typeof BLOG_DURABILITY_SCHEMA_VERSION;
  exportedAt: string;
  source: BlogDurabilitySourceMetadata;
  selection: {
    articleSlugs: string[];
    includedStatuses: ["DRAFT", "PUBLISHED"];
  };
  categories: BlogDurabilityCategoryEntry[];
  articles: BlogDurabilityArticleEntry[];
  checksums: {
    algorithm: typeof BLOG_DURABILITY_CHECKSUM_ALGORITHM;
    canonicalization: typeof BLOG_DURABILITY_CANONICALIZATION;
    bundleChecksum: string;
  };
  summary: {
    categoryCount: number;
    articleCount: number;
    countsByStatus: { DRAFT: number; PUBLISHED: number };
    featuredImageRefCount: number;
    bodyImageRefCount: number;
    excludedArchivedCount: number;
    excludedArchivedSlugs: string[];
  };
};

function normalizeJson(value: unknown, ancestors: Set<object>): BlogDurabilityJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("BLOG_DURABILITY_JSON_INVALID");
    return value;
  }
  if (typeof value !== "object") throw new Error("BLOG_DURABILITY_JSON_INVALID");
  if (ancestors.has(value)) throw new Error("BLOG_DURABILITY_JSON_CYCLIC");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeJson(item, ancestors));

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("BLOG_DURABILITY_JSON_INVALID");
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("BLOG_DURABILITY_JSON_INVALID");

    const normalized: { [key: string]: BlogDurabilityJson } = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJson((value as Record<string, unknown>)[key], ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeBlogDurabilityJson(value: unknown): BlogDurabilityJson {
  return normalizeJson(value, new Set<object>());
}

export function stableBlogDurabilityJson(value: unknown): string {
  return JSON.stringify(normalizeBlogDurabilityJson(value));
}

export function checksumBlogDurabilityJson(value: unknown): string {
  return createHash("sha256").update(stableBlogDurabilityJson(value), "utf8").digest("hex");
}

export function serializeBlogDurabilityBundle(bundle: BlogDurabilityBundleV1): string {
  return `${JSON.stringify(normalizeBlogDurabilityJson(bundle), null, 2)}\n`;
}

function parseHttpImageUrl(rawUrl: string): { url: string; assetPath: string } {
  if (!rawUrl || /[\u0000-\u001f\u007f]/.test(rawUrl) || rawUrl.startsWith("//")) {
    throw new Error("BLOG_DURABILITY_IMAGE_URL_INVALID");
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("BLOG_DURABILITY_IMAGE_URL_INVALID");
    }
    return { url: rawUrl, assetPath: parsed.pathname };
  } catch (error) {
    if (error instanceof Error && error.message === "BLOG_DURABILITY_IMAGE_URL_INVALID") throw error;
    throw new Error("BLOG_DURABILITY_IMAGE_URL_INVALID");
  }
}

export function deriveFeaturedImageRef(
  featuredImageUrl: string | null,
  featuredImageAlt: string | null,
): BlogDurabilityImageRef | null {
  if (!featuredImageUrl) {
    if (featuredImageAlt) throw new Error("BLOG_DURABILITY_FEATURED_IMAGE_ORPHAN_ALT");
    return null;
  }
  const alt = featuredImageAlt?.trim();
  if (!alt) throw new Error("BLOG_DURABILITY_FEATURED_IMAGE_ALT_REQUIRED");
  const parsed = parseHttpImageUrl(featuredImageUrl);
  return { ...parsed, alt };
}

export function extractBodyImageRefs(contentMarkdown: string): BlogDurabilityBodyImageRef[] {
  const refs: BlogDurabilityBodyImageRef[] = [];
  const lines = contentMarkdown.replace(/\r\n?/g, "\n").split("\n");
  let inCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const trimmed = line.trim();
    const match = /^!\[([^\]]+)\]\(([^)\s]+)\)\s*$/.exec(trimmed);
    if (!match) {
      if (trimmed.startsWith("![") && trimmed.endsWith(")")) {
        throw new Error("BLOG_DURABILITY_BODY_IMAGE_INVALID");
      }
      continue;
    }

    const alt = match[1].trim();
    if (!alt) throw new Error("BLOG_DURABILITY_BODY_IMAGE_ALT_REQUIRED");
    const parsed = parseHttpImageUrl(match[2].trim());
    refs.push({ ...parsed, alt, occurrence: refs.length });
  }
  return refs;
}

export function articleContentChecksumPayload(
  article: BlogDurabilityArticleContent,
): BlogDurabilityArticleContent {
  return {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    contentMarkdown: article.contentMarkdown,
    tags: article.tags,
    categorySlug: article.categorySlug,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    contentOrigin: article.contentOrigin,
    aiGenerationMeta: article.aiGenerationMeta,
  };
}

export function articleStateChecksumPayload(article: BlogDurabilityArticleState): BlogDurabilityArticleState {
  return { slug: article.slug, status: article.status, publishedAt: article.publishedAt };
}

export function categoryChecksumPayload(category: BlogDurabilityCategoryEntry) {
  return {
    slug: category.slug,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}

export function bundleChecksumPayload(bundle: BlogDurabilityBundleV1) {
  const checksumDescriptor = {
    algorithm: bundle.checksums.algorithm,
    canonicalization: bundle.checksums.canonicalization,
  };
  return { ...bundle, checksums: checksumDescriptor };
}

export function verifyBlogDurabilityBundleChecksums(bundle: BlogDurabilityBundleV1): boolean {
  const categoriesValid = bundle.categories.every(
    (category) => checksumBlogDurabilityJson(categoryChecksumPayload(category)) === category.checksum,
  );
  const articlesValid = bundle.articles.every(
    (article) =>
      checksumBlogDurabilityJson(articleContentChecksumPayload(article)) === article.checksums.contentChecksum &&
      checksumBlogDurabilityJson(articleStateChecksumPayload(article)) === article.checksums.stateChecksum,
  );
  return (
    categoriesValid &&
    articlesValid &&
    checksumBlogDurabilityJson(bundleChecksumPayload(bundle)) === bundle.checksums.bundleChecksum
  );
}
