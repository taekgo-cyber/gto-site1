"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import {
  createBlogArticle,
  createBlogCategory,
  setBlogArticleStatus,
  scheduleBlogArticlePublication,
  updateBlogArticle,
  updateBlogCategory,
} from "@/lib/blog/service";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = text(formData, key).trim();
  return value || undefined;
}

function safeBlogError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: "관리자 권한이 필요합니다.",
    BLOG_SLUG_INVALID: "슬러그 형식이 올바르지 않습니다.",
    BLOG_SLUG_TAKEN: "이미 사용 중인 슬러그입니다.",
    BLOG_CATEGORY_NAME_INVALID: "카테고리 이름을 확인해 주세요.",
    BLOG_CATEGORY_DESCRIPTION_INVALID: "카테고리 설명이 너무 깁니다.",
    BLOG_CATEGORY_SORT_INVALID: "카테고리 정렬 순서를 확인해 주세요.",
    BLOG_CATEGORY_ACTIVE_INVALID: "카테고리 활성 상태가 올바르지 않습니다.",
    BLOG_CATEGORY_ID_INVALID: "카테고리 선택값이 올바르지 않습니다.",
    BLOG_CATEGORY_NOT_FOUND: "카테고리를 찾을 수 없습니다.",
    BLOG_CATEGORY_INACTIVE: "비활성 카테고리는 새 글이나 발행 글에 지정할 수 없습니다.",
    BLOG_TITLE_INVALID: "제목은 2~120자로 입력해 주세요.",
    BLOG_EXCERPT_INVALID: "요약은 300자 이하로 입력해 주세요.",
    BLOG_CONTENT_INVALID: "본문을 입력해 주세요.",
    BLOG_TAG_INVALID: "태그는 각 40자 이하로 입력해 주세요.",
    BLOG_TAGS_INVALID: "태그는 최대 10개까지 입력할 수 있습니다.",
    BLOG_FEATURED_IMAGE_URL_INVALID: "대표 이미지 URL은 http/https 주소만 사용할 수 있습니다.",
    BLOG_FEATURED_IMAGE_ALT_INVALID: "대표 이미지 ALT는 200자 이하로 입력해 주세요.",
    BLOG_FEATURED_IMAGE_ALT_REQUIRED: "대표 이미지를 사용하면 ALT 텍스트가 필요합니다.",
    BLOG_SEO_TITLE_INVALID: "SEO 제목은 70자 이하로 입력해 주세요.",
    BLOG_SEO_DESCRIPTION_INVALID: "SEO 설명은 160자 이하로 입력해 주세요.",
    BLOG_ARTICLE_NOT_FOUND: "글을 찾을 수 없습니다.",
    BLOG_ARTICLE_ARCHIVED: "보관된 글은 다시 수정하거나 발행할 수 없습니다.",
    BLOG_PUBLISH_TIME_INVALID: "발행 시각이 올바르지 않습니다.",
    BLOG_PUBLISH_SCHEDULE_INVALID: "예약 발행 시각은 현재보다 이후여야 합니다.",
    BLOG_PUBLISH_SCHEDULE_DRAFT_REQUIRED: "초안 상태의 글만 예약 발행할 수 있습니다.",
  };
  return messages[code] ?? "처리 중 오류가 발생했습니다.";
}

export async function scheduleBlogArticlePublicationAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  const articleId = text(formData, "articleId").trim();
  const rawPublishAt = text(formData, "publishAt").trim();
  if (!articleId) redirect(adminBlogUrl({ error: "글 식별자가 없습니다." }));
  const publishAt = new Date(`${rawPublishAt}:00+09:00`);
  try {
    await scheduleBlogArticlePublication({ actorUserId: user.id, articleId, publishAt });
  } catch (error) {
    redirect(adminEditUrl(articleId, { error: safeBlogError(error) }));
  }
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${articleId}/edit`);
  revalidatePath("/blog");
  redirect(adminEditUrl(articleId, { message: "관리자 검수 완료 글의 예약 발행 시각을 저장했습니다." }));
}

function adminBlogUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `/admin/blog?${search.toString()}`;
}

function adminEditUrl(articleId: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `/admin/blog/${encodeURIComponent(articleId)}/edit?${search.toString()}`;
}

export async function createBlogCategoryAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  try {
    await createBlogCategory({
      actorUserId: user.id,
      slug: text(formData, "slug"),
      name: text(formData, "name"),
      description: optionalText(formData, "description"),
      sortOrder: text(formData, "sortOrder") || "0",
      isActive: text(formData, "isActive") === "true",
    });
  } catch (error) {
    redirect(adminBlogUrl({ error: safeBlogError(error) }));
  }
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  redirect(adminBlogUrl({ message: "카테고리를 생성했습니다." }));
}

export async function updateBlogCategoryAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  const categoryId = text(formData, "categoryId").trim();
  if (!categoryId) redirect(adminBlogUrl({ error: "카테고리 식별자가 없습니다." }));

  try {
    await updateBlogCategory({
      actorUserId: user.id,
      categoryId,
      slug: text(formData, "slug"),
      name: text(formData, "name"),
      description: optionalText(formData, "description"),
      sortOrder: text(formData, "sortOrder") || "0",
      isActive: text(formData, "isActive") === "true",
    });
  } catch (error) {
    redirect(adminBlogUrl({ error: safeBlogError(error) }));
  }
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  redirect(adminBlogUrl({ message: "카테고리를 수정했습니다." }));
}

export async function createBlogArticleAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  let articleId = "";
  try {
    const article = await createBlogArticle({
      actorUserId: user.id,
      slug: text(formData, "slug"),
      title: text(formData, "title"),
      excerpt: optionalText(formData, "excerpt"),
      contentMarkdown: text(formData, "contentMarkdown"),
      seoTitle: optionalText(formData, "seoTitle"),
      seoDescription: optionalText(formData, "seoDescription"),
      categoryId: optionalText(formData, "categoryId"),
      tags: text(formData, "tags"),
      featuredImageUrl: optionalText(formData, "featuredImageUrl"),
      featuredImageAlt: optionalText(formData, "featuredImageAlt"),
    });
    articleId = article.id;
  } catch (error) {
    redirect(adminBlogUrl({ error: safeBlogError(error) }));
  }
  revalidatePath("/admin/blog");
  redirect(adminEditUrl(articleId, { message: "초안을 생성했습니다." }));
}

export async function updateBlogArticleAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  const articleId = text(formData, "articleId").trim();
  if (!articleId) redirect(adminBlogUrl({ error: "글 식별자가 없습니다." }));

  try {
    await updateBlogArticle({
      actorUserId: user.id,
      articleId,
      slug: text(formData, "slug"),
      title: text(formData, "title"),
      excerpt: optionalText(formData, "excerpt"),
      contentMarkdown: text(formData, "contentMarkdown"),
      seoTitle: optionalText(formData, "seoTitle"),
      seoDescription: optionalText(formData, "seoDescription"),
      categoryId: optionalText(formData, "categoryId"),
      tags: text(formData, "tags"),
      featuredImageUrl: optionalText(formData, "featuredImageUrl"),
      featuredImageAlt: optionalText(formData, "featuredImageAlt"),
    });
  } catch (error) {
    redirect(adminEditUrl(articleId, { error: safeBlogError(error) }));
  }
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${articleId}/edit`);
  revalidatePath(`/admin/blog/${articleId}/preview`);
  revalidatePath("/blog");
  redirect(adminEditUrl(articleId, { message: "글을 저장했습니다." }));
}

export async function setBlogArticleStatusAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  const articleId = text(formData, "articleId").trim();
  const requestedStatus = text(formData, "status");
  if (!articleId) redirect(adminBlogUrl({ error: "글 식별자가 없습니다." }));
  if (requestedStatus !== "DRAFT" && requestedStatus !== "PUBLISHED" && requestedStatus !== "ARCHIVED") {
    redirect(adminEditUrl(articleId, { error: "상태 변경 요청이 올바르지 않습니다." }));
  }

  try {
    await setBlogArticleStatus({ actorUserId: user.id, articleId, status: requestedStatus });
  } catch (error) {
    redirect(adminEditUrl(articleId, { error: safeBlogError(error) }));
  }
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${articleId}/edit`);
  revalidatePath(`/admin/blog/${articleId}/preview`);
  revalidatePath("/blog");
  redirect(adminEditUrl(articleId, { message: `상태를 ${requestedStatus}로 변경했습니다.` }));
}
