import { prisma } from "@/lib/prisma";
import {
  BLOG_DURABILITY_CANONICALIZATION,
  BLOG_DURABILITY_CHECKSUM_ALGORITHM,
  BLOG_DURABILITY_FORMAT,
  BLOG_DURABILITY_SCHEMA_VERSION,
  articleContentChecksumPayload,
  articleStateChecksumPayload,
  bundleChecksumPayload,
  categoryChecksumPayload,
  checksumBlogDurabilityJson,
  deriveFeaturedImageRef,
  extractBodyImageRefs,
  normalizeBlogDurabilityJson,
  type BlogDurabilityArticleEntry,
  type BlogDurabilityBundleV1,
  type BlogDurabilityCategoryEntry,
  type BlogDurabilitySourceMetadata,
} from "./bundle-v1";

export type BlogDurabilitySourceRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentMarkdown: string;
  tags: unknown;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  contentOrigin: "MANUAL" | "AI";
  aiGenerationMeta: unknown;
  automationJobId: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string | null;
  category: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

function isoDate(value: Date, errorCode: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(errorCode);
  return value.toISOString();
}

function requiredMetadata(value: string, errorCode: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(errorCode);
  return normalized;
}

function validateSourceMetadata(source: BlogDurabilitySourceMetadata): BlogDurabilitySourceMetadata {
  const head = requiredMetadata(source.head, "BLOG_DURABILITY_SOURCE_HEAD_REQUIRED");
  if (!/^[0-9a-f]{40}$/i.test(head)) throw new Error("BLOG_DURABILITY_SOURCE_HEAD_INVALID");
  return {
    environmentLabel: requiredMetadata(source.environmentLabel, "BLOG_DURABILITY_SOURCE_ENV_REQUIRED"),
    branch: requiredMetadata(source.branch, "BLOG_DURABILITY_SOURCE_BRANCH_REQUIRED"),
    head: head.toLowerCase(),
    exporterVersion: requiredMetadata(source.exporterVersion, "BLOG_DURABILITY_EXPORTER_VERSION_REQUIRED"),
  };
}

function tagsFromJson(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error("BLOG_DURABILITY_TAGS_INVALID");
  }
  return [...value];
}

function categoryEntryFromRow(row: NonNullable<BlogDurabilitySourceRow["category"]>): BlogDurabilityCategoryEntry {
  const entry: BlogDurabilityCategoryEntry = {
    slug: row.slug,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    source: {
      id: row.id,
      createdAt: isoDate(row.createdAt, "BLOG_DURABILITY_CATEGORY_CREATED_AT_INVALID"),
      updatedAt: isoDate(row.updatedAt, "BLOG_DURABILITY_CATEGORY_UPDATED_AT_INVALID"),
    },
    checksum: "",
  };
  entry.checksum = checksumBlogDurabilityJson(categoryChecksumPayload(entry));
  return entry;
}

function articleEntryFromRow(row: BlogDurabilitySourceRow): BlogDurabilityArticleEntry {
  if (row.status === "ARCHIVED") throw new Error("BLOG_DURABILITY_ARCHIVED_ARTICLE_SELECTED");
  const publishedAt = row.publishedAt
    ? isoDate(row.publishedAt, "BLOG_DURABILITY_PUBLISHED_AT_INVALID")
    : null;
  if (row.status === "DRAFT" && publishedAt !== null) throw new Error("BLOG_DURABILITY_DRAFT_PUBLISHED_AT_INVALID");
  if (row.status === "PUBLISHED" && publishedAt === null) throw new Error("BLOG_DURABILITY_PUBLISHED_AT_REQUIRED");

  const article: BlogDurabilityArticleEntry = {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentMarkdown: row.contentMarkdown,
    tags: tagsFromJson(row.tags),
    categorySlug: row.category?.slug ?? null,
    status: row.status,
    publishedAt,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    featuredImageUrl: row.featuredImageUrl,
    featuredImageAlt: row.featuredImageAlt,
    contentOrigin: row.contentOrigin,
    aiGenerationMeta: normalizeBlogDurabilityJson(row.aiGenerationMeta),
    imageRefs: {
      featured: deriveFeaturedImageRef(row.featuredImageUrl, row.featuredImageAlt),
      body: extractBodyImageRefs(row.contentMarkdown),
    },
    source: {
      id: row.id,
      createdAt: isoDate(row.createdAt, "BLOG_DURABILITY_ARTICLE_CREATED_AT_INVALID"),
      updatedAt: isoDate(row.updatedAt, "BLOG_DURABILITY_ARTICLE_UPDATED_AT_INVALID"),
      authorRef: row.authorId ? { sourceId: row.authorId } : null,
      automationJobRef: row.automationJobId ? { sourceJobId: row.automationJobId } : null,
    },
    checksums: { contentChecksum: "", stateChecksum: "" },
  };
  article.checksums.contentChecksum = checksumBlogDurabilityJson(articleContentChecksumPayload(article));
  article.checksums.stateChecksum = checksumBlogDurabilityJson(articleStateChecksumPayload(article));
  return article;
}

export function buildBlogDurabilityBundleV1(input: {
  rows: BlogDurabilitySourceRow[];
  exportedAt: Date;
  source: BlogDurabilitySourceMetadata;
}): BlogDurabilityBundleV1 {
  const exportedAt = isoDate(input.exportedAt, "BLOG_DURABILITY_EXPORTED_AT_INVALID");
  const source = validateSourceMetadata(input.source);
  const selectedRows = input.rows
    .filter((row) => row.status === "DRAFT" || row.status === "PUBLISHED")
    .sort((left, right) => left.slug.localeCompare(right.slug, "en"));
  const archivedSlugs = input.rows
    .filter((row) => row.status === "ARCHIVED")
    .map((row) => row.slug)
    .sort((left, right) => left.localeCompare(right, "en"));

  const categoryBySlug = new Map<string, BlogDurabilityCategoryEntry>();
  for (const row of selectedRows) {
    if (!row.category) continue;
    const entry = categoryEntryFromRow(row.category);
    const existing = categoryBySlug.get(entry.slug);
    if (existing && existing.checksum !== entry.checksum) throw new Error("BLOG_DURABILITY_CATEGORY_SOURCE_CONFLICT");
    categoryBySlug.set(entry.slug, entry);
  }

  const categories = [...categoryBySlug.values()].sort((left, right) => left.slug.localeCompare(right.slug, "en"));
  const articles = selectedRows.map(articleEntryFromRow);
  const countsByStatus = articles.reduce(
    (counts, article) => ({ ...counts, [article.status]: counts[article.status] + 1 }),
    { DRAFT: 0, PUBLISHED: 0 },
  );

  const bundleWithoutChecksum = {
    format: BLOG_DURABILITY_FORMAT,
    schemaVersion: BLOG_DURABILITY_SCHEMA_VERSION,
    exportedAt,
    source,
    selection: {
      articleSlugs: articles.map((article) => article.slug),
      includedStatuses: ["DRAFT", "PUBLISHED"] as ["DRAFT", "PUBLISHED"],
    },
    categories,
    articles,
    checksums: {
      algorithm: BLOG_DURABILITY_CHECKSUM_ALGORITHM,
      canonicalization: BLOG_DURABILITY_CANONICALIZATION,
      bundleChecksum: "",
    },
    summary: {
      categoryCount: categories.length,
      articleCount: articles.length,
      countsByStatus,
      featuredImageRefCount: articles.filter((article) => article.imageRefs.featured !== null).length,
      bodyImageRefCount: articles.reduce((count, article) => count + article.imageRefs.body.length, 0),
      excludedArchivedCount: archivedSlugs.length,
      excludedArchivedSlugs: archivedSlugs,
    },
  } satisfies BlogDurabilityBundleV1;

  bundleWithoutChecksum.checksums.bundleChecksum = checksumBlogDurabilityJson(
    bundleChecksumPayload(bundleWithoutChecksum),
  );
  return bundleWithoutChecksum;
}

export async function exportBlogDurabilityBundleV1(input: {
  exportedAt?: Date;
  source: BlogDurabilitySourceMetadata;
}): Promise<BlogDurabilityBundleV1> {
  const rows = await prisma.blogArticle.findMany({
    where: { status: { in: ["DRAFT", "PUBLISHED", "ARCHIVED"] } },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMarkdown: true,
      tags: true,
      featuredImageUrl: true,
      featuredImageAlt: true,
      contentOrigin: true,
      aiGenerationMeta: true,
      automationJobId: true,
      status: true,
      seoTitle: true,
      seoDescription: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      category: {
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          isActive: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { slug: "asc" },
  });

  return buildBlogDurabilityBundleV1({ rows, exportedAt: input.exportedAt ?? new Date(), source: input.source });
}
