"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { generateAiBlogDraft } from "@/lib/blog/ai/service";
import { AI_CONTENT_SOURCE_TYPES, type AiContentSourceType } from "@/lib/blog/ai/types";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function sourceType(value: string): AiContentSourceType {
  if ((AI_CONTENT_SOURCE_TYPES as readonly string[]).includes(value)) return value as AiContentSourceType;
  throw new Error("BLOG_AI_SOURCE_TYPE_INVALID");
}

function safeMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "BLOG_AI_PROVIDER_NOT_CONFIGURED") return "AI provider 환경변수(BLOG_AI_*)가 설정되지 않았습니다.";
  if (code === "BLOG_AI_QUALITY_FAILED") return "AI 초안이 개인정보/HTML/URL 등 필수 품질검사를 통과하지 못했습니다.";
  if (code === "BLOG_AI_SOURCE_NOT_PUBLIC_OR_MISSING") return "선택한 데이터 중 공개 사용이 불가능하거나 존재하지 않는 항목이 있습니다.";
  if (code.startsWith("BLOG_AI_PROVIDER_")) return "AI provider 호출 또는 응답 검증에 실패했습니다.";
  if (code.startsWith("BLOG_AI_")) return "AI 콘텐츠 생성 입력을 확인해 주세요.";
  if (code === "BLOG_SLUG_TAKEN") return "생성된 slug가 기존 글과 중복됩니다. 다시 생성하거나 직접 수정해 주세요.";
  if (code === "ADMIN_REQUIRED") return "활성 관리자 권한이 필요합니다.";
  return "AI 초안 생성 중 오류가 발생했습니다.";
}

export async function generateAiBlogDraftAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  const requestedType = text(formData, "sourceType");
  let parsedType: AiContentSourceType;
  try {
    parsedType = sourceType(requestedType);
  } catch (error) {
    redirect(`/admin/blog/ai?error=${encodeURIComponent(safeMessage(error))}`);
  }

  let articleId: string;
  try {
    const result = await generateAiBlogDraft({
      actorUserId: user.id,
      request: {
        topic: text(formData, "topic"),
        targetKeyword: text(formData, "targetKeyword"),
        sourceType: parsedType,
        sourceIds: formData.getAll("sourceIds").filter((value): value is string => typeof value === "string"),
        instruction: text(formData, "instruction") || undefined,
      },
    });
    articleId = result.article.id;
  } catch (error) {
    redirect(`/admin/blog/ai?sourceType=${encodeURIComponent(parsedType)}&error=${encodeURIComponent(safeMessage(error))}`);
  }

  redirect(`/admin/blog/${encodeURIComponent(articleId)}/edit?message=${encodeURIComponent("AI 초안을 DRAFT로 생성했습니다. 검수·수정 후 직접 발행해 주세요.")}`);
}
