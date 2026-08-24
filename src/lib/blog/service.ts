import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { validateBlogArticleInput, validateBlogCategoryInput } from "./validation";

export async function assertActiveBlogAdmin(actorUserId: string): Promise<void> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, status: true, deletedAt: true },
  });
  if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE" || actor.deletedAt) throw new Error("ADMIN_REQUIRED");
}

function mapWriteError(error: unknown): never {
  if ((error as { code?: string })?.code === "P2002") throw new Error("BLOG_SLUG_TAKEN");
  throw error;
}

async function assertCategoryExists(categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const category = await prisma.blogCategory.findUnique({ where: { id: categoryId }, select: { id: true, isActive: true } });
  if (!category) throw new Error("BLOG_CATEGORY_NOT_FOUND");
  if (!category.isActive) throw new Error("BLOG_CATEGORY_INACTIVE");
}

export async function createBlogCategory(input: {
  actorUserId: string;
  slug: unknown;
  name: unknown;
  description?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
}) {
  await assertActiveBlogAdmin(input.actorUserId);
  const data = validateBlogCategoryInput(input);
  try {
    return await prisma.blogCategory.create({ data, select: { id: true, slug: true, name: true, isActive: true } });
  } catch (error) {
    mapWriteError(error);
  }
}

export async function updateBlogCategory(input: {
  actorUserId: string;
  categoryId: string;
  slug: unknown;
  name: unknown;
  description?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
}) {
  await assertActiveBlogAdmin(input.actorUserId);
  const data = validateBlogCategoryInput(input);
  try {
    return await prisma.blogCategory.update({
      where: { id: input.categoryId },
      data,
      select: { id: true, slug: true, name: true, isActive: true },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2025") throw new Error("BLOG_CATEGORY_NOT_FOUND");
    mapWriteError(error);
  }
}

export async function createBlogArticle(input: {
  actorUserId: string;
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
  contentOrigin?: "MANUAL" | "AI";
  aiGenerationMeta?: Prisma.InputJsonValue;
  automationJobId?: string;
}) {
  await assertActiveBlogAdmin(input.actorUserId);
  const data = validateBlogArticleInput(input);
  await assertCategoryExists(data.categoryId);
  try {
    return await prisma.blogArticle.create({
      data: { ...data, authorId: input.actorUserId, status: "DRAFT", publishedAt: null, contentOrigin: input.contentOrigin ?? "MANUAL", aiGenerationMeta: input.aiGenerationMeta, automationJobId: input.automationJobId },
      select: { id: true, slug: true, status: true },
    });
  } catch (error) {
    mapWriteError(error);
  }
}

export async function updateBlogArticle(input: {
  actorUserId: string;
  articleId: string;
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
  await assertActiveBlogAdmin(input.actorUserId);
  const data = validateBlogArticleInput(input);
  await assertCategoryExists(data.categoryId);
  const current = await prisma.blogArticle.findUnique({ where: { id: input.articleId }, select: { status: true } });
  if (!current) throw new Error("BLOG_ARTICLE_NOT_FOUND");
  if (current.status === "ARCHIVED") throw new Error("BLOG_ARTICLE_ARCHIVED");
  try {
    return await prisma.blogArticle.update({
      where: { id: input.articleId },
      data,
      select: { id: true, slug: true, status: true, publishedAt: true },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2025") throw new Error("BLOG_ARTICLE_NOT_FOUND");
    mapWriteError(error);
  }
}

export async function setBlogArticleStatus(input: {
  actorUserId: string;
  articleId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  now?: Date;
}) {
  await assertActiveBlogAdmin(input.actorUserId);
  const current = await prisma.blogArticle.findUnique({
    where: { id: input.articleId },
    select: { id: true, slug: true, title: true, excerpt: true, contentMarkdown: true, seoTitle: true, seoDescription: true, tags: true, featuredImageUrl: true, featuredImageAlt: true, status: true, publishedAt: true, categoryId: true },
  });
  if (!current) throw new Error("BLOG_ARTICLE_NOT_FOUND");
  if (current.status === "ARCHIVED" && input.status !== "ARCHIVED") throw new Error("BLOG_ARTICLE_ARCHIVED");
  if (current.status === input.status) return { id: current.id, slug: current.slug, status: current.status, publishedAt: current.publishedAt };
  if (input.status === "PUBLISHED") {
    validateBlogArticleInput({ slug: current.slug, title: current.title, excerpt: current.excerpt, contentMarkdown: current.contentMarkdown, seoTitle: current.seoTitle, seoDescription: current.seoDescription, categoryId: current.categoryId, tags: current.tags, featuredImageUrl: current.featuredImageUrl, featuredImageAlt: current.featuredImageAlt });
    await assertCategoryExists(current.categoryId);
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("BLOG_PUBLISH_TIME_INVALID");
  return prisma.blogArticle.update({
    where: { id: current.id },
    data: {
      status: input.status,
      publishedAt: input.status === "PUBLISHED" ? current.publishedAt ?? now : null,
    },
    select: { id: true, slug: true, status: true, publishedAt: true },
  });
}

export async function getAdminBlogOverview(actorUserId: string) {
  await assertActiveBlogAdmin(actorUserId);
  const [categories, articles] = await Promise.all([
    prisma.blogCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.blogArticle.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        category: { select: { id: true, slug: true, name: true, isActive: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  return { categories, articles };
}

export async function getAdminBlogArticle(actorUserId: string, articleId: string) {
  await assertActiveBlogAdmin(actorUserId);
  const article = await prisma.blogArticle.findUnique({
    where: { id: articleId },
    include: { category: true, author: { select: { id: true, name: true } } },
  });
  if (!article) throw new Error("BLOG_ARTICLE_NOT_FOUND");
  const categories = await prisma.blogCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return { article, categories };
}

export async function scheduleBlogArticlePublication(input: {
  actorUserId: string;
  articleId: string;
  publishAt: Date;
  now?: Date;
}) {
  await assertActiveBlogAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  if (Number.isNaN(input.publishAt.getTime()) || input.publishAt <= now) throw new Error("BLOG_PUBLISH_SCHEDULE_INVALID");
  const current = await prisma.blogArticle.findUnique({
    where: { id: input.articleId },
    select: { id: true, status: true, slug: true, title: true, excerpt: true, contentMarkdown: true, seoTitle: true, seoDescription: true, tags: true, featuredImageUrl: true, featuredImageAlt: true, categoryId: true },
  });
  if (!current) throw new Error("BLOG_ARTICLE_NOT_FOUND");
  if (current.status !== "DRAFT") throw new Error("BLOG_PUBLISH_SCHEDULE_DRAFT_REQUIRED");
  validateBlogArticleInput({ slug: current.slug, title: current.title, excerpt: current.excerpt, contentMarkdown: current.contentMarkdown, seoTitle: current.seoTitle, seoDescription: current.seoDescription, categoryId: current.categoryId, tags: current.tags, featuredImageUrl: current.featuredImageUrl, featuredImageAlt: current.featuredImageAlt });
  await assertCategoryExists(current.categoryId);
  return prisma.blogArticle.update({
    where: { id: current.id },
    data: { status: "PUBLISHED", publishedAt: input.publishAt },
    select: { id: true, slug: true, status: true, publishedAt: true },
  });
}
