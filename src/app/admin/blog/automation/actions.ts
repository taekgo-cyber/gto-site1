"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { cancelBlogContentJob, enqueueBlogContentJob, processDueBlogContentJobs, retryBlogContentJob, setBlogAutomationControl } from "@/lib/blog/automation";
import { AI_CONTENT_SOURCE_TYPES, type AiContentSourceType } from "@/lib/blog/ai/types";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function pageUrl(params: Record<string, string>): string {
  return `/admin/blog/automation?${new URLSearchParams(params).toString()}`;
}

function parseSourceType(value: string): AiContentSourceType {
  if ((AI_CONTENT_SOURCE_TYPES as readonly string[]).includes(value)) return value as AiContentSourceType;
  throw new Error("BLOG_AI_SOURCE_TYPE_INVALID");
}

function parseKstDate(value: string): Date {
  const date = new Date(`${value}:00+09:00`);
  if (!value || Number.isNaN(date.getTime())) throw new Error("BLOG_AUTOMATION_SCHEDULE_INVALID");
  return date;
}

function safeMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: "활성 관리자 권한이 필요합니다.",
    BLOG_AUTOMATION_SCHEDULE_INVALID: "예약 시각은 현재부터 1년 이내로 입력해 주세요.",
    BLOG_AUTOMATION_DAILY_LIMIT_INVALID: "일일 생성 한도는 1~100 사이여야 합니다.",
    BLOG_AUTOMATION_JOB_NOT_FOUND: "작업을 찾을 수 없습니다.",
    BLOG_AUTOMATION_JOB_NOT_RETRYABLE: "실패 또는 취소된 작업만 다시 대기열에 넣을 수 있습니다.",
    BLOG_AUTOMATION_IDEMPOTENCY_MISMATCH: "같은 요청 키가 다른 주제에 사용되었습니다.",
  };
  return messages[code] ?? "자동화 요청을 처리하지 못했습니다. 입력과 작업 상태를 확인해 주세요.";
}

export async function enqueueBlogContentJobAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  try {
    const sourceIds = formData.getAll("sourceIds").filter((value): value is string => typeof value === "string");
    await enqueueBlogContentJob({
      actorUserId: user.id,
      idempotencyKey: text(formData, "idempotencyKey"),
      scheduledFor: parseKstDate(text(formData, "scheduledFor")),
      request: {
        topic: text(formData, "topic"),
        targetKeyword: text(formData, "targetKeyword"),
        sourceType: parseSourceType(text(formData, "sourceType")),
        sourceIds,
        instruction: text(formData, "instruction") || undefined,
      },
    });
  } catch (error) {
    redirect(pageUrl({ error: safeMessage(error) }));
  }
  revalidatePath("/admin/blog/automation");
  redirect(pageUrl({ message: "콘텐츠 생성 작업을 대기열에 등록했습니다." }));
}

export async function updateBlogAutomationControlAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  try {
    await setBlogAutomationControl({ actorUserId: user.id, isPaused: text(formData, "isPaused") === "true", dailyLimit: Number(text(formData, "dailyLimit")) });
  } catch (error) {
    redirect(pageUrl({ error: safeMessage(error) }));
  }
  revalidatePath("/admin/blog/automation");
  redirect(pageUrl({ message: "자동화 운영 설정을 저장했습니다." }));
}

export async function runDueBlogContentJobsAction(): Promise<void> {
  const user = await requireRole("ADMIN");
  const result = await processDueBlogContentJobs({ runnerId: `admin:${user.id}:${randomUUID()}`, batchSize: 1 });
  revalidatePath("/admin/blog/automation");
  revalidatePath("/admin/blog");
  redirect(pageUrl({ message: `실행 결과: 성공 ${result.succeeded}, 실패 ${result.failed}, 재시도 ${result.retried}, 취소 ${result.cancelled}` }));
}

export async function cancelBlogContentJobAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  try {
    await cancelBlogContentJob({ actorUserId: user.id, jobId: text(formData, "jobId") });
  } catch (error) {
    redirect(pageUrl({ error: safeMessage(error) }));
  }
  revalidatePath("/admin/blog/automation");
  redirect(pageUrl({ message: "취소 요청을 반영했습니다." }));
}

export async function retryBlogContentJobAction(formData: FormData): Promise<void> {
  const user = await requireRole("ADMIN");
  try {
    await retryBlogContentJob({ actorUserId: user.id, jobId: text(formData, "jobId") });
  } catch (error) {
    redirect(pageUrl({ error: safeMessage(error) }));
  }
  revalidatePath("/admin/blog/automation");
  redirect(pageUrl({ message: "작업을 다시 대기열에 넣었습니다." }));
}
