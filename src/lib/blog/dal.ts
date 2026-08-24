import { prisma } from "@/lib/prisma";
import type { PublicBlogArticle, PublicBlogArticleListItem } from "./types";
import { normalizeBlogTags, validateBlogSlug } from "./validation";

const BLOG_PAGE_SIZE = 12;

export async function listPublishedBlogArticles(input: {
  categorySlug?: string | null;
  page?: number;
  now?: Date;
} = {}): Promise<{ items: PublicBlogArticleListItem[]; page: number; totalPages: number; total: number }> {
  const now = input.now ?? new Date();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const categorySlug = input.categorySlug ? validateBlogSlug(input.categorySlug) : null;
  const where = {
    status: "PUBLISHED" as const,
    publishedAt: { lte: now, not: null },
    ...(categorySlug ? { category: { slug: categorySlug, isActive: true } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.blogArticle.count({ where }),
    prisma.blogArticle.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        tags: true,
        featuredImageUrl: true,
        featuredImageAlt: true,
        publishedAt: true,
        updatedAt: true,
        category: { select: { slug: true, name: true, isActive: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * BLOG_PAGE_SIZE,
      take: BLOG_PAGE_SIZE,
    }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      tags: normalizeBlogTags(row.tags),
      featuredImageUrl: row.featuredImageUrl,
      featuredImageAlt: row.featuredImageAlt,
      publishedAt: row.publishedAt!,
      updatedAt: row.updatedAt,
      category: row.category?.isActive ? { slug: row.category.slug, name: row.category.name } : null,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)),
    total,
  };
}

export async function getPublishedBlogArticleBySlug(slugInput: string, now = new Date()): Promise<PublicBlogArticle | null> {
  const slug = validateBlogSlug(slugInput);
  const row = await prisma.blogArticle.findFirst({
    where: { slug, status: "PUBLISHED", publishedAt: { lte: now, not: null } },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMarkdown: true,
      tags: true,
      featuredImageUrl: true,
      featuredImageAlt: true,
      seoTitle: true,
      seoDescription: true,
      publishedAt: true,
      updatedAt: true,
      category: { select: { slug: true, name: true, isActive: true } },
      author: { select: { name: true } },
    },
  });
  if (!row || !row.publishedAt) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentMarkdown: row.contentMarkdown,
    tags: normalizeBlogTags(row.tags),
    featuredImageUrl: row.featuredImageUrl,
    featuredImageAlt: row.featuredImageAlt,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    category: row.category?.isActive ? { slug: row.category.slug, name: row.category.name } : null,
    authorName: row.author?.name ?? null,
  };
}

export async function getPublicBlogCategory(slugInput: string) {
  const slug = validateBlogSlug(slugInput);
  return prisma.blogCategory.findFirst({
    where: { slug, isActive: true },
    select: { id: true, slug: true, name: true, description: true },
  });
}

export async function listPublicBlogCategories(now = new Date()) {
  return prisma.blogCategory.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      _count: { select: { articles: { where: { status: "PUBLISHED", publishedAt: { lte: now, not: null } } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listPublishedBlogSitemapRows(now = new Date()) {
  const [articles, categories] = await Promise.all([
    prisma.blogArticle.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: now, not: null } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.blogCategory.findMany({
      where: {
        isActive: true,
        articles: { some: { status: "PUBLISHED", publishedAt: { lte: now, not: null } } },
      },
      select: { slug: true, updatedAt: true },
    }),
  ]);
  return { articles, categories };
}
