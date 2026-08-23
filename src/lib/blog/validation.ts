const BLOG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BLOG_TAG_MAX = 40;
export const BLOG_TAGS_MAX = 10;
export const BLOG_FEATURED_IMAGE_URL_MAX = 2_000;
export const BLOG_FEATURED_IMAGE_ALT_MAX = 200;

export function validateBlogSlug(value: unknown): string {
  if (typeof value !== "string") throw new Error("BLOG_SLUG_INVALID");
  const slug = value.trim();
  if (slug.length < 3 || slug.length > 120 || !BLOG_SLUG_RE.test(slug)) throw new Error("BLOG_SLUG_INVALID");
  return slug;
}

function requiredText(value: unknown, min: number, max: number, errorCode: string): string {
  if (typeof value !== "string") throw new Error(errorCode);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(errorCode);
  return normalized;
}

function optionalText(value: unknown, max: number, errorCode: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(errorCode);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error(errorCode);
  return normalized;
}

function optionalBoolean(value: unknown, defaultValue: boolean, errorCode: string): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") throw new Error(errorCode);
  return value;
}

export function normalizeBlogTags(value: unknown): string[] {
  const raw =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = entry.trim();
    if (!tag) continue;
    if (tag.length > BLOG_TAG_MAX) throw new Error("BLOG_TAG_INVALID");
    const key = tag.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > BLOG_TAGS_MAX) throw new Error("BLOG_TAGS_INVALID");
  return tags;
}

function optionalHttpUrl(value: unknown): string | null {
  const normalized = optionalText(value, BLOG_FEATURED_IMAGE_URL_MAX, "BLOG_FEATURED_IMAGE_URL_INVALID");
  if (!normalized) return null;
  if (normalized.startsWith("//")) throw new Error("BLOG_FEATURED_IMAGE_URL_INVALID");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("BLOG_FEATURED_IMAGE_URL_INVALID");
    return url.toString();
  } catch {
    throw new Error("BLOG_FEATURED_IMAGE_URL_INVALID");
  }
}

export function validateBlogCategoryInput(input: {
  slug: unknown;
  name: unknown;
  description?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
}) {
  const sortOrder = Number(input.sortOrder ?? 0);
  if (!Number.isInteger(sortOrder) || sortOrder < -10_000 || sortOrder > 10_000) {
    throw new Error("BLOG_CATEGORY_SORT_INVALID");
  }
  return {
    slug: validateBlogSlug(input.slug),
    name: requiredText(input.name, 2, 60, "BLOG_CATEGORY_NAME_INVALID"),
    description: optionalText(input.description, 300, "BLOG_CATEGORY_DESCRIPTION_INVALID"),
    sortOrder,
    isActive: optionalBoolean(input.isActive, true, "BLOG_CATEGORY_ACTIVE_INVALID"),
  };
}

export function validateBlogArticleInput(input: {
  slug: unknown;
  title: unknown;
  excerpt?: unknown;
  contentMarkdown: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
  categoryId?: unknown;
  tags?: unknown;
  featuredImageUrl?: unknown;
  featuredImageAlt?: unknown;
}) {
  let categoryId: string | null = null;
  if (input.categoryId != null && input.categoryId !== "") {
    if (typeof input.categoryId !== "string" || !input.categoryId.trim() || input.categoryId.trim().length > 191) {
      throw new Error("BLOG_CATEGORY_ID_INVALID");
    }
    categoryId = input.categoryId.trim();
  }

  const featuredImageUrl = optionalHttpUrl(input.featuredImageUrl);
  const featuredImageAlt = optionalText(
    input.featuredImageAlt,
    BLOG_FEATURED_IMAGE_ALT_MAX,
    "BLOG_FEATURED_IMAGE_ALT_INVALID",
  );
  if (featuredImageUrl && !featuredImageAlt) throw new Error("BLOG_FEATURED_IMAGE_ALT_REQUIRED");

  return {
    slug: validateBlogSlug(input.slug),
    title: requiredText(input.title, 2, 120, "BLOG_TITLE_INVALID"),
    excerpt: optionalText(input.excerpt, 300, "BLOG_EXCERPT_INVALID"),
    contentMarkdown: requiredText(input.contentMarkdown, 1, 100_000, "BLOG_CONTENT_INVALID"),
    seoTitle: optionalText(input.seoTitle, 70, "BLOG_SEO_TITLE_INVALID"),
    seoDescription: optionalText(input.seoDescription, 160, "BLOG_SEO_DESCRIPTION_INVALID"),
    categoryId,
    tags: normalizeBlogTags(input.tags),
    featuredImageUrl,
    featuredImageAlt,
  };
}

export function parseBlogPage(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Math.min(10_000, Number(value)));
}
