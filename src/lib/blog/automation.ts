import { createHash } from "node:crypto";
import type { AiBlogProvider, AiContentGenerationRequest } from "@/lib/blog/ai/types";
import { AI_CONTENT_SOURCE_TYPES } from "@/lib/blog/ai/types";
import { generateAiBlogDraft } from "@/lib/blog/ai/service";
import { validateAiContentGenerationRequest } from "@/lib/blog/ai/source";
import { assertActiveBlogAdmin } from "@/lib/blog/service";
import { prisma } from "@/lib/prisma";
import { logOperationalError } from "@/lib/observability/logger";

const CONTROL_ID = "default";
const MAX_BATCH_SIZE = 5;
const STALE_LOCK_MS = 15 * 60 * 1000;

export type BlogAutomationFailure = { code: string; retryable: boolean };

export function classifyBlogAutomationFailure(error: unknown): BlogAutomationFailure {
  const raw = error instanceof Error ? error.message : "";
  if (raw === "ADMIN_REQUIRED") return { code: "AUTHORIZATION_REVOKED", retryable: false };
  if (raw === "BLOG_AI_SOURCE_NOT_PUBLIC_OR_MISSING") return { code: "SOURCE_UNAVAILABLE", retryable: false };
  if (raw === "BLOG_AI_QUALITY_FAILED") return { code: "QUALITY_REJECTED", retryable: false };
  if (raw === "BLOG_SLUG_TAKEN") return { code: "DUPLICATE_SLUG", retryable: false };
  if (raw === "BLOG_AI_PROVIDER_NOT_CONFIGURED") return { code: "PROVIDER_NOT_CONFIGURED", retryable: true };
  if (raw.startsWith("BLOG_AI_PROVIDER_")) return { code: "PROVIDER_FAILURE", retryable: true };
  return { code: "UNEXPECTED_FAILURE", retryable: false };
}

export function buildBlogTopicKey(request: AiContentGenerationRequest): string {
  const canonical = [
    request.topic.normalize("NFKC").trim().toLocaleLowerCase("ko-KR"),
    request.targetKeyword.normalize("NFKC").trim().toLocaleLowerCase("en-US"),
    request.sourceType,
    [...request.sourceIds].sort().join(","),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{8,120}$/.test(value)) throw new Error("BLOG_AUTOMATION_IDEMPOTENCY_INVALID");
  return value;
}

function validateSchedule(value: unknown, now: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("BLOG_AUTOMATION_SCHEDULE_INVALID");
  if (value.getTime() < now.getTime() - 60_000 || value.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
    throw new Error("BLOG_AUTOMATION_SCHEDULE_INVALID");
  }
  return value < now ? now : value;
}

export async function enqueueBlogContentJob(input: {
  actorUserId: string;
  request: AiContentGenerationRequest;
  idempotencyKey: string;
  scheduledFor: Date;
  now?: Date;
}) {
  await assertActiveBlogAdmin(input.actorUserId);
  const request = validateAiContentGenerationRequest(input.request);
  const now = input.now ?? new Date();
  const data = {
    requestedById: input.actorUserId,
    topic: request.topic,
    targetKeyword: request.targetKeyword,
    sourceType: request.sourceType,
    sourceIds: request.sourceIds,
    instruction: request.instruction,
    topicKey: buildBlogTopicKey(request),
    idempotencyKey: validateIdempotencyKey(input.idempotencyKey),
    scheduledFor: validateSchedule(input.scheduledFor, now),
  };
  try {
    return await prisma.blogContentJob.create({ data, select: { id: true, status: true, scheduledFor: true } });
  } catch (error) {
    if ((error as { code?: string })?.code !== "P2002") throw error;
    const byIdempotency = await prisma.blogContentJob.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select: { id: true, topicKey: true, status: true, scheduledFor: true },
    });
    if (byIdempotency) {
      if (byIdempotency.topicKey !== data.topicKey) throw new Error("BLOG_AUTOMATION_IDEMPOTENCY_MISMATCH");
      return byIdempotency;
    }
    const byTopic = await prisma.blogContentJob.findUnique({ where: { topicKey: data.topicKey }, select: { id: true, status: true, scheduledFor: true } });
    if (byTopic) return byTopic;
    throw error;
  }
}

export async function setBlogAutomationControl(input: { actorUserId: string; isPaused: boolean; dailyLimit: number }) {
  await assertActiveBlogAdmin(input.actorUserId);
  if (!Number.isInteger(input.dailyLimit) || input.dailyLimit < 1 || input.dailyLimit > 100) throw new Error("BLOG_AUTOMATION_DAILY_LIMIT_INVALID");
  return prisma.blogAutomationControl.upsert({
    where: { id: CONTROL_ID },
    create: { id: CONTROL_ID, isPaused: input.isPaused, dailyLimit: input.dailyLimit, updatedById: input.actorUserId },
    update: { isPaused: input.isPaused, dailyLimit: input.dailyLimit, updatedById: input.actorUserId },
  });
}

export async function cancelBlogContentJob(input: { actorUserId: string; jobId: string; now?: Date }) {
  await assertActiveBlogAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  const current = await prisma.blogContentJob.findUnique({ where: { id: input.jobId }, select: { status: true } });
  if (!current) throw new Error("BLOG_AUTOMATION_JOB_NOT_FOUND");
  if (current.status === "SUCCEEDED" || current.status === "CANCELLED") return current;
  if (current.status === "RUNNING") {
    return prisma.blogContentJob.update({ where: { id: input.jobId }, data: { cancelRequestedAt: now }, select: { id: true, status: true } });
  }
  return prisma.blogContentJob.update({ where: { id: input.jobId }, data: { status: "CANCELLED", cancelledAt: now, lockedAt: null, lockedBy: null }, select: { id: true, status: true } });
}

export async function retryBlogContentJob(input: { actorUserId: string; jobId: string; now?: Date }) {
  await assertActiveBlogAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  const current = await prisma.blogContentJob.findUnique({ where: { id: input.jobId }, select: { status: true, maxAttempts: true } });
  if (!current || (current.status !== "FAILED" && current.status !== "CANCELLED") || current.maxAttempts >= 5) {
    throw new Error("BLOG_AUTOMATION_JOB_NOT_RETRYABLE");
  }
  const changed = await prisma.blogContentJob.updateMany({
    where: { id: input.jobId, status: { in: ["FAILED", "CANCELLED"] }, maxAttempts: current.maxAttempts },
    data: { status: "QUEUED", scheduledFor: now, maxAttempts: { increment: 1 }, cancelRequestedAt: null, cancelledAt: null, lastErrorCode: null, lastErrorAt: null, lockedAt: null, lockedBy: null },
  });
  if (changed.count === 0) throw new Error("BLOG_AUTOMATION_JOB_NOT_RETRYABLE");
}

export async function getBlogAutomationOverview(actorUserId: string) {
  await assertActiveBlogAdmin(actorUserId);
  const [control, jobs] = await Promise.all([
    prisma.blogAutomationControl.findUnique({ where: { id: CONTROL_ID } }),
    prisma.blogContentJob.findMany({
      select: { id: true, topic: true, targetKeyword: true, sourceType: true, status: true, scheduledFor: true, attemptCount: true, maxAttempts: true, lastErrorCode: true, completedAt: true, createdAt: true, article: { select: { id: true, slug: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { control: control ?? { id: CONTROL_ID, isPaused: false, dailyLimit: 10, updatedAt: null }, jobs };
}

function kstDayStart(now: Date): Date {
  const offset = 9 * 60 * 60 * 1000;
  return new Date(Math.floor((now.getTime() + offset) / 86_400_000) * 86_400_000 - offset);
}

async function recoverStaleJobs(now: Date): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const stale = await prisma.blogContentJob.findMany({
    where: { status: "RUNNING", lockedAt: { lt: staleBefore } },
    select: { id: true, attemptCount: true, maxAttempts: true },
    take: 20,
  });
  for (const job of stale) {
    const exhausted = job.attemptCount >= job.maxAttempts;
    await prisma.blogContentJob.updateMany({
      where: { id: job.id, status: "RUNNING", lockedAt: { lt: staleBefore } },
      data: { status: exhausted ? "FAILED" : "QUEUED", scheduledFor: now, lockedAt: null, lockedBy: null, lastErrorCode: "STALE_CLAIM", lastErrorAt: now },
    });
    await prisma.blogContentJobAttempt.updateMany({
      where: { jobId: job.id, status: "RUNNING", finishedAt: null },
      data: { status: "FAILED", errorCode: "STALE_CLAIM", finishedAt: now },
    });
  }
  return stale.length;
}

export async function processDueBlogContentJobs(input: {
  runnerId: string;
  now?: Date;
  batchSize?: number;
  provider?: AiBlogProvider;
}) {
  const now = input.now ?? new Date();
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(input.batchSize ?? MAX_BATCH_SIZE)));
  const recovered = await recoverStaleJobs(now);
  const control = await prisma.blogAutomationControl.findUnique({ where: { id: CONTROL_ID } });
  if (control?.isPaused) return { claimed: 0, succeeded: 0, failed: 0, retried: 0, cancelled: 0, recovered, paused: true, budgetRemaining: control.dailyLimit };
  const dailyLimit = control?.dailyLimit ?? 10;
  const attemptsToday = await prisma.blogContentJobAttempt.count({ where: { startedAt: { gte: kstDayStart(now) } } });
  let budgetRemaining = Math.max(0, dailyLimit - attemptsToday);
  const due = budgetRemaining === 0 ? [] : await prisma.blogContentJob.findMany({
    where: { status: "QUEUED", scheduledFor: { lte: now }, cancelRequestedAt: null },
    select: { id: true },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: Math.min(batchSize, budgetRemaining),
  });
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let retried = 0;
  let cancelled = 0;

  for (const dueJob of due) {
    const claim = await prisma.blogContentJob.updateMany({
      where: { id: dueJob.id, status: "QUEUED", scheduledFor: { lte: now }, cancelRequestedAt: null },
      data: { status: "RUNNING", lockedAt: now, lockedBy: input.runnerId, attemptCount: { increment: 1 } },
    });
    if (claim.count === 0) continue;
    claimed += 1;
    const job = await prisma.blogContentJob.findUnique({ where: { id: dueJob.id } });
    if (!job) continue;
    const attempt = await prisma.blogContentJobAttempt.create({ data: { jobId: job.id, attemptNumber: job.attemptCount, runnerId: input.runnerId } });
    try {
      const existingArticle = await prisma.blogArticle.findUnique({ where: { automationJobId: job.id }, select: { id: true } });
      const sourceIds = Array.isArray(job.sourceIds) ? job.sourceIds.filter((value): value is string => typeof value === "string") : [];
      if (!(AI_CONTENT_SOURCE_TYPES as readonly string[]).includes(job.sourceType)) throw new Error("BLOG_AI_SOURCE_TYPE_INVALID");
      if (!existingArticle) {
        if (!job.requestedById) throw new Error("ADMIN_REQUIRED");
        await generateAiBlogDraft({
          actorUserId: job.requestedById,
          request: { topic: job.topic, targetKeyword: job.targetKeyword, sourceType: job.sourceType as AiContentGenerationRequest["sourceType"], sourceIds, instruction: job.instruction ?? undefined },
          provider: input.provider,
          now,
          automationJobId: job.id,
        });
      }
      const current = await prisma.blogContentJob.findUnique({ where: { id: job.id }, select: { cancelRequestedAt: true } });
      await prisma.$transaction([
        prisma.blogContentJob.update({ where: { id: job.id }, data: current?.cancelRequestedAt ? { status: "CANCELLED", cancelledAt: now, completedAt: now, lockedAt: null, lockedBy: null } : { status: "SUCCEEDED", completedAt: now, lockedAt: null, lockedBy: null } }),
        prisma.blogContentJobAttempt.update({ where: { id: attempt.id }, data: { status: "SUCCEEDED", finishedAt: now } }),
      ]);
      if (current?.cancelRequestedAt) cancelled += 1;
      else succeeded += 1;
      budgetRemaining -= 1;
    } catch (error) {
      const failure = classifyBlogAutomationFailure(error);
      logOperationalError({
        operation: "blog_content_job",
        actorType: "SYSTEM",
        category: failure.code === "PROVIDER_FAILURE" || failure.code === "PROVIDER_NOT_CONFIGURED" ? "PROVIDER" : "UNEXPECTED",
        error,
        identifiers: { jobId: job.id },
      });
      const cancellation = await prisma.blogContentJob.findUnique({ where: { id: job.id }, select: { cancelRequestedAt: true } });
      const shouldRetry = failure.retryable && job.attemptCount < job.maxAttempts && !cancellation?.cancelRequestedAt;
      const retryAt = new Date(now.getTime() + Math.min(60, 5 * 2 ** Math.max(0, job.attemptCount - 1)) * 60_000);
      await prisma.$transaction([
        prisma.blogContentJob.update({ where: { id: job.id }, data: cancellation?.cancelRequestedAt ? { status: "CANCELLED", cancelledAt: now, lockedAt: null, lockedBy: null, lastErrorCode: failure.code, lastErrorAt: now } : shouldRetry ? { status: "QUEUED", scheduledFor: retryAt, lockedAt: null, lockedBy: null, lastErrorCode: failure.code, lastErrorAt: now } : { status: "FAILED", lockedAt: null, lockedBy: null, lastErrorCode: failure.code, lastErrorAt: now } }),
        prisma.blogContentJobAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", errorCode: failure.code, finishedAt: now } }),
      ]);
      if (shouldRetry) retried += 1;
      else failed += 1;
    }
  }
  return { claimed, succeeded, failed, retried, cancelled, recovered, paused: false, budgetRemaining };
}
