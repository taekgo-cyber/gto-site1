import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  jobCreate: vi.fn(),
  jobFindUnique: vi.fn(),
  jobFindMany: vi.fn(),
  jobUpdateMany: vi.fn(),
  attemptCount: vi.fn(),
  attemptUpdateMany: vi.fn(),
  controlFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    blogContentJob: {
      create: mocks.jobCreate,
      findUnique: mocks.jobFindUnique,
      findMany: mocks.jobFindMany,
      updateMany: mocks.jobUpdateMany,
    },
    blogContentJobAttempt: { count: mocks.attemptCount, updateMany: mocks.attemptUpdateMany },
    blogAutomationControl: { findUnique: mocks.controlFindUnique },
  },
}));

import { buildBlogTopicKey, classifyBlogAutomationFailure, enqueueBlogContentJob, processDueBlogContentJobs, retryBlogContentJob } from "@/lib/blog/automation";
import type { AiBlogProvider, AiContentGenerationRequest } from "@/lib/blog/ai/types";

const now = new Date("2026-08-24T12:00:00.000Z");
const request: AiContentGenerationRequest = { topic: "5톤 준비", targetKeyword: "5ton-guide", sourceType: "TONNAGE", sourceIds: ["b", "a"] };

describe("Blog S20 automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null });
    mocks.jobFindMany.mockResolvedValue([]);
    mocks.attemptCount.mockResolvedValue(0);
    mocks.attemptUpdateMany.mockResolvedValue({ count: 0 });
    mocks.controlFindUnique.mockResolvedValue(null);
  });

  it("builds a stable topic key independent of source ID order", () => {
    expect(buildBlogTopicKey(request)).toBe(buildBlogTopicKey({ ...request, sourceIds: ["a", "b"] }));
    expect(buildBlogTopicKey(request)).not.toBe(buildBlogTopicKey({ ...request, targetKeyword: "different" }));
  });

  it("maps provider failures to bounded retry and privacy/auth failures to permanent classes", () => {
    expect(classifyBlogAutomationFailure(new Error("BLOG_AI_PROVIDER_TIMEOUT"))).toEqual({ code: "PROVIDER_FAILURE", retryable: true });
    expect(classifyBlogAutomationFailure(new Error("BLOG_AI_QUALITY_FAILED"))).toEqual({ code: "QUALITY_REJECTED", retryable: false });
    expect(classifyBlogAutomationFailure(new Error("ADMIN_REQUIRED"))).toEqual({ code: "AUTHORIZATION_REVOKED", retryable: false });
  });

  it("reuses an existing job on idempotency/topic unique conflict", async () => {
    mocks.jobCreate.mockRejectedValue({ code: "P2002" });
    mocks.jobFindUnique.mockResolvedValue({ id: "job-1", topicKey: buildBlogTopicKey(request), status: "QUEUED", scheduledFor: now });
    const result = await enqueueBlogContentJob({ actorUserId: "admin-1", request, idempotencyKey: "request:12345678", scheduledFor: now, now });
    expect(result.id).toBe("job-1");
    expect(mocks.jobCreate).toHaveBeenCalledTimes(1);
    expect(mocks.jobFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { idempotencyKey: "request:12345678" } }));
  });

  it("rejects a non-admin before queue mutation", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", role: "USER", status: "ACTIVE", deletedAt: null });
    await expect(enqueueBlogContentJob({ actorUserId: "user-1", request, idempotencyKey: "request:12345678", scheduledFor: now, now })).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it("does not inspect due jobs or call the provider while paused", async () => {
    mocks.controlFindUnique.mockResolvedValue({ isPaused: true, dailyLimit: 7 });
    const provider: AiBlogProvider = { provider: "fake", model: "fake", generate: vi.fn() };
    const result = await processDueBlogContentJobs({ runnerId: "runner-1", now, provider });
    expect(result).toEqual(expect.objectContaining({ paused: true, claimed: 0 }));
    expect(mocks.attemptCount).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("stops before provider work when the KST daily budget is exhausted", async () => {
    mocks.controlFindUnique.mockResolvedValue({ isPaused: false, dailyLimit: 2 });
    mocks.attemptCount.mockResolvedValue(2);
    const provider: AiBlogProvider = { provider: "fake", model: "fake", generate: vi.fn() };
    const result = await processDueBlogContentJobs({ runnerId: "runner-1", now, provider });
    expect(result).toEqual(expect.objectContaining({ claimed: 0, budgetRemaining: 0 }));
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("allows explicit retry only through a state-guarded update", async () => {
    mocks.jobFindUnique.mockResolvedValue({ status: "FAILED", maxAttempts: 3 });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
    await retryBlogContentJob({ actorUserId: "admin-1", jobId: "job-1", now });
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "job-1", status: { in: ["FAILED", "CANCELLED"] }, maxAttempts: 3 } }));
  });
});
