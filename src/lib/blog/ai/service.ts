import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { assertActiveBlogAdmin, createBlogArticle } from "@/lib/blog/service";
import { validateBlogArticleInput, validateBlogSlug } from "@/lib/blog/validation";
import { createConfiguredBlogAiProvider, validateGeneratedBlogDraft } from "./provider";
import { inspectGeneratedDraft } from "./quality";
import { loadAiContentSources, validateAiContentGenerationRequest } from "./source";
import type { AiBlogProvider, AiContentGenerationRequest, GeneratedBlogDraft } from "./types";

function simpleHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function slugifyAscii(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

export function canonicalizeGeneratedSlug(draft: GeneratedBlogDraft, request: AiContentGenerationRequest): string {
  for (const candidate of [draft.slug, request.targetKeyword]) {
    const slug = slugifyAscii(candidate);
    try {
      return validateBlogSlug(slug);
    } catch {
      // try next candidate
    }
  }
  return `ai-${simpleHash(`${request.topic}|${request.targetKeyword}`)}`;
}

export async function generateAiBlogDraft(input: {
  actorUserId: string;
  request: AiContentGenerationRequest;
  provider?: AiBlogProvider;
  now?: Date;
  automationJobId?: string;
}) {
  // Authorization precedes source reads and the billable provider call. The
  // canonical create service checks again immediately before persistence.
  await assertActiveBlogAdmin(input.actorUserId);
  const request = validateAiContentGenerationRequest(input.request);
  const now = input.now ?? new Date();
  const sources = await loadAiContentSources(request, now);
  const provider = input.provider ?? createConfiguredBlogAiProvider();
  const generated = validateGeneratedBlogDraft(await provider.generate(request, sources));
  const normalized: GeneratedBlogDraft = { ...generated, slug: canonicalizeGeneratedSlug(generated, request) };

  validateBlogArticleInput({
    slug: normalized.slug,
    title: normalized.title,
    excerpt: normalized.excerpt,
    contentMarkdown: normalized.contentMarkdown,
    seoTitle: normalized.seoTitle,
    seoDescription: normalized.seoDescription,
    tags: normalized.tags,
  });

  const quality = await inspectGeneratedDraft(normalized, sources);
  if (!quality.ok) throw new Error("BLOG_AI_QUALITY_FAILED");

  let categoryId: string | null = null;
  if (normalized.suggestedCategorySlug) {
    const category = await prisma.blogCategory.findFirst({
      where: { slug: normalized.suggestedCategorySlug, isActive: true },
      select: { id: true },
    });
    if (category) categoryId = category.id;
    else quality.issues.push({ code: "CATEGORY_NOT_FOUND", severity: "WARNING", message: "제안 카테고리가 없어 미분류로 저장했습니다." });
  }

  const meta = {
    version: 1,
    provider: provider.provider,
    model: provider.model,
    topic: request.topic,
    targetKeyword: request.targetKeyword,
    sourceType: request.sourceType,
    sourceIds: request.sourceIds,
    quality,
    generatedAt: now.toISOString(),
    ...(input.automationJobId ? { automationJobId: input.automationJobId } : {}),
  } satisfies Prisma.InputJsonValue;

  const article = await createBlogArticle({
    actorUserId: input.actorUserId,
    slug: normalized.slug,
    title: normalized.title,
    excerpt: normalized.excerpt,
    contentMarkdown: normalized.contentMarkdown,
    seoTitle: normalized.seoTitle,
    seoDescription: normalized.seoDescription,
    categoryId,
    tags: normalized.tags,
    contentOrigin: "AI",
    aiGenerationMeta: meta,
    automationJobId: input.automationJobId,
  });

  return { article, generated: normalized, sources, quality };
}
