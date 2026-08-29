import { z } from "zod";
import {
  BLOG_DURABILITY_CANONICALIZATION,
  BLOG_DURABILITY_CHECKSUM_ALGORITHM,
  BLOG_DURABILITY_FORMAT,
  BLOG_DURABILITY_SCHEMA_VERSION,
  deriveFeaturedImageRef,
  extractBodyImageRefs,
  stableBlogDurabilityJson,
  verifyBlogDurabilityBundleChecksums,
  type BlogDurabilityBundleV1,
  type BlogDurabilityJson,
} from "./bundle-v1";

const isoUtcSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  });
const nonEmptyStringSchema = z.string().min(1);
const checksumSchema = z.string().regex(/^[0-9a-f]{64}$/);

const jsonSchema: z.ZodType<BlogDurabilityJson> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const imageRefSchema = z
  .object({
    url: nonEmptyStringSchema,
    alt: nonEmptyStringSchema,
    assetPath: nonEmptyStringSchema,
  })
  .strict();

const bodyImageRefSchema = imageRefSchema.extend({ occurrence: z.number().int().nonnegative() }).strict();

const categorySchema = z
  .object({
    slug: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    description: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    source: z
      .object({
        id: nonEmptyStringSchema,
        createdAt: isoUtcSchema,
        updatedAt: isoUtcSchema,
      })
      .strict(),
    checksum: checksumSchema,
  })
  .strict();

const articleSchema = z
  .object({
    slug: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    excerpt: z.string().nullable(),
    contentMarkdown: z.string(),
    tags: z.array(z.string()),
    categorySlug: z.string().min(1).nullable(),
    status: z.enum(["DRAFT", "PUBLISHED"]),
    publishedAt: isoUtcSchema.nullable(),
    seoTitle: z.string().nullable(),
    seoDescription: z.string().nullable(),
    featuredImageUrl: z.string().nullable(),
    featuredImageAlt: z.string().nullable(),
    contentOrigin: z.enum(["MANUAL", "AI"]),
    aiGenerationMeta: jsonSchema,
    imageRefs: z
      .object({
        featured: imageRefSchema.nullable(),
        body: z.array(bodyImageRefSchema),
      })
      .strict(),
    source: z
      .object({
        id: nonEmptyStringSchema,
        createdAt: isoUtcSchema,
        updatedAt: isoUtcSchema,
        authorRef: z.object({ sourceId: nonEmptyStringSchema }).strict().nullable(),
        automationJobRef: z.object({ sourceJobId: nonEmptyStringSchema }).strict().nullable(),
      })
      .strict(),
    checksums: z
      .object({
        contentChecksum: checksumSchema,
        stateChecksum: checksumSchema,
      })
      .strict(),
  })
  .strict();

const bundleSchema = z
  .object({
    format: z.literal(BLOG_DURABILITY_FORMAT),
    schemaVersion: z.literal(BLOG_DURABILITY_SCHEMA_VERSION),
    exportedAt: isoUtcSchema,
    source: z
      .object({
        environmentLabel: nonEmptyStringSchema,
        branch: nonEmptyStringSchema,
        head: z.string().regex(/^[0-9a-f]{40}$/),
        exporterVersion: nonEmptyStringSchema,
      })
      .strict(),
    selection: z
      .object({
        articleSlugs: z.array(nonEmptyStringSchema),
        includedStatuses: z.tuple([z.literal("DRAFT"), z.literal("PUBLISHED")]),
      })
      .strict(),
    categories: z.array(categorySchema),
    articles: z.array(articleSchema),
    checksums: z
      .object({
        algorithm: z.literal(BLOG_DURABILITY_CHECKSUM_ALGORITHM),
        canonicalization: z.literal(BLOG_DURABILITY_CANONICALIZATION),
        bundleChecksum: checksumSchema,
      })
      .strict(),
    summary: z
      .object({
        categoryCount: z.number().int().nonnegative(),
        articleCount: z.number().int().nonnegative(),
        countsByStatus: z
          .object({ DRAFT: z.number().int().nonnegative(), PUBLISHED: z.number().int().nonnegative() })
          .strict(),
        featuredImageRefCount: z.number().int().nonnegative(),
        bodyImageRefCount: z.number().int().nonnegative(),
        excludedArchivedCount: z.number().int().nonnegative(),
        excludedArchivedSlugs: z.array(nonEmptyStringSchema),
      })
      .strict(),
  })
  .strict();

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasDuplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function containsForbiddenSecretKey(value: BlogDurabilityJson): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenSecretKey);

  for (const [key, child] of Object.entries(value)) {
    if (/^(api[_-]?key|authorization|credential|database[_-]?url|password|secret|token)$/i.test(key)) return true;
    if (containsForbiddenSecretKey(child)) return true;
  }
  return false;
}

export type BlogDurabilityBundleValidation = {
  bundle: BlogDurabilityBundleV1 | null;
  errors: string[];
};

export function validateBlogDurabilityBundleV1(value: unknown): BlogDurabilityBundleValidation {
  const parsed = bundleSchema.safeParse(value);
  if (!parsed.success) {
    return { bundle: null, errors: ["BLOG_DURABILITY_BUNDLE_STRUCTURE_INVALID"] };
  }

  const bundle = parsed.data as BlogDurabilityBundleV1;
  const errors = new Set<string>();
  const add = (code: string) => errors.add(code);
  const articleSlugs = bundle.articles.map((article) => article.slug);
  const categorySlugs = bundle.categories.map((category) => category.slug);
  const archivedSlugs = bundle.summary.excludedArchivedSlugs;

  if (!verifyBlogDurabilityBundleChecksums(bundle)) add("BLOG_DURABILITY_BUNDLE_CHECKSUM_INVALID");
  if (containsForbiddenSecretKey(bundle as unknown as BlogDurabilityJson)) add("BLOG_DURABILITY_SECRET_MATERIAL_FORBIDDEN");

  if (hasDuplicate(articleSlugs) || !arraysEqual(articleSlugs, sorted(articleSlugs))) {
    add("BLOG_DURABILITY_ARTICLE_ORDER_INVALID");
  }
  if (!arraysEqual(bundle.selection.articleSlugs, articleSlugs)) add("BLOG_DURABILITY_SELECTION_MISMATCH");
  if (hasDuplicate(categorySlugs) || !arraysEqual(categorySlugs, sorted(categorySlugs))) {
    add("BLOG_DURABILITY_CATEGORY_ORDER_INVALID");
  }
  if (hasDuplicate(archivedSlugs) || !arraysEqual(archivedSlugs, sorted(archivedSlugs))) {
    add("BLOG_DURABILITY_ARCHIVED_ORDER_INVALID");
  }
  if (archivedSlugs.some((slug) => articleSlugs.includes(slug))) add("BLOG_DURABILITY_ARCHIVED_SELECTION_CONFLICT");

  const referencedCategorySlugs = sorted(
    [...new Set(bundle.articles.flatMap((article) => (article.categorySlug ? [article.categorySlug] : [])))],
  );
  if (!arraysEqual(referencedCategorySlugs, categorySlugs)) add("BLOG_DURABILITY_CATEGORY_SELECTION_MISMATCH");

  const categoryBySlug = new Map(bundle.categories.map((category) => [category.slug, category]));
  for (const article of bundle.articles) {
    if (article.status === "DRAFT" && article.publishedAt !== null) add("BLOG_DURABILITY_DRAFT_PUBLISHED_AT_INVALID");
    if (article.status === "PUBLISHED" && article.publishedAt === null) add("BLOG_DURABILITY_PUBLISHED_AT_REQUIRED");
    if (article.status === "PUBLISHED" && article.categorySlug && !categoryBySlug.get(article.categorySlug)?.isActive) {
      add("BLOG_DURABILITY_PUBLISHED_CATEGORY_INACTIVE");
    }
    try {
      const featured = deriveFeaturedImageRef(article.featuredImageUrl, article.featuredImageAlt);
      const body = extractBodyImageRefs(article.contentMarkdown);
      if (stableBlogDurabilityJson(featured) !== stableBlogDurabilityJson(article.imageRefs.featured)) {
        add("BLOG_DURABILITY_FEATURED_IMAGE_REF_MISMATCH");
      }
      if (stableBlogDurabilityJson(body) !== stableBlogDurabilityJson(article.imageRefs.body)) {
        add("BLOG_DURABILITY_BODY_IMAGE_REF_MISMATCH");
      }
    } catch (error) {
      add(error instanceof Error ? error.message : "BLOG_DURABILITY_IMAGE_REF_INVALID");
    }
  }

  const draftCount = bundle.articles.filter((article) => article.status === "DRAFT").length;
  const publishedCount = bundle.articles.filter((article) => article.status === "PUBLISHED").length;
  const featuredCount = bundle.articles.filter((article) => article.imageRefs.featured !== null).length;
  const bodyCount = bundle.articles.reduce((count, article) => count + article.imageRefs.body.length, 0);
  if (
    bundle.summary.categoryCount !== bundle.categories.length ||
    bundle.summary.articleCount !== bundle.articles.length ||
    bundle.summary.countsByStatus.DRAFT !== draftCount ||
    bundle.summary.countsByStatus.PUBLISHED !== publishedCount ||
    bundle.summary.featuredImageRefCount !== featuredCount ||
    bundle.summary.bodyImageRefCount !== bodyCount ||
    bundle.summary.excludedArchivedCount !== archivedSlugs.length
  ) {
    add("BLOG_DURABILITY_SUMMARY_MISMATCH");
  }

  return { bundle, errors: [...errors].sort() };
}
