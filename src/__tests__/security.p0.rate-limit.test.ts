import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import {
  buildServerRequestKey,
  enforceDistinctRequestLimit,
  enforceRequestRateLimit,
  enforceSubjectRateLimit,
  rateLimitResponse,
  SecurityRateLimitError,
} from "@/lib/security/rate-limit";

const now = new Date("2026-09-05T06:00:00.000Z");
const requestHeaders = new Headers({
  "x-forwarded-for": "203.0.113.10, 10.0.0.1",
  "user-agent": "normal-browser",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPPORT_ABUSE_HASH_SECRET", "s".repeat(48));
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ supportRateLimitBucket: { deleteMany: mocks.deleteMany, upsert: mocks.upsert } }),
  );
});

afterEach(() => vi.unstubAllEnvs());

describe("Security P0 durable rate limiter", () => {
  it("stores only an HMAC key and uses an atomic incrementing upsert", async () => {
    mocks.upsert.mockResolvedValue({ count: 1 });
    await expect(enforceRequestRateLimit({
      headers: requestHeaders,
      scope: "auth:login",
      policy: { limit: 10, windowMs: 15 * 60_000 },
      now,
    })).resolves.toBeUndefined();

    const write = mocks.upsert.mock.calls[0][0];
    expect(write.where.key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(write)).not.toContain("203.0.113.10");
    expect(JSON.stringify(write)).not.toContain("normal-browser");
    expect(write.update).toEqual({ count: { increment: 1 } });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { windowStart: { lt: new Date(now.getTime() - 48 * 60 * 60_000) } },
    });
  });

  it("allows the threshold and returns a controlled retry window after it", async () => {
    mocks.upsert.mockResolvedValueOnce({ count: 10 }).mockResolvedValueOnce({ count: 11 });
    const input = {
      headers: requestHeaders,
      scope: "auth:login",
      policy: { limit: 10, windowMs: 15 * 60_000 },
      now,
    };
    await expect(enforceRequestRateLimit(input)).resolves.toBeUndefined();
    await expect(enforceRequestRateLimit(input)).rejects.toMatchObject({
      message: "SECURITY_RATE_LIMITED",
      retryAfterSeconds: 900,
    });
    const response = rateLimitResponse(new SecurityRateLimitError(321));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("321");
  });

  it("uses one unique bucket so concurrent pressure cannot bypass the limit", async () => {
    let count = 0;
    mocks.upsert.mockImplementation(async () => ({ count: ++count }));
    const attempts = await Promise.allSettled(
      Array.from({ length: 11 }, () => enforceRequestRateLimit({
        headers: requestHeaders,
        scope: "auth:login",
        policy: { limit: 10, windowMs: 15 * 60_000 },
        now,
      })),
    );
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(new Set(mocks.upsert.mock.calls.map((call) => call[0].where.key)).size).toBe(1);
  });

  it("does not partition IP or ad dedupe identity when User-Agent rotates", () => {
    const first = buildServerRequestKey({
      headers: new Headers({ "x-real-ip": "203.0.113.10", "user-agent": "browser-a" }),
      scope: "ads:click-dedupe",
      subject: "campaign-1",
      windowMs: 10 * 60_000,
      now,
    });
    const rotated = buildServerRequestKey({
      headers: new Headers({ "x-real-ip": "203.0.113.10", "user-agent": "browser-b" }),
      scope: "ads:click-dedupe",
      subject: "campaign-1",
      windowMs: 10 * 60_000,
      now,
    });
    expect(rotated.key).toBe(first.key);
  });

  it("stores a normalized login identifier only inside an HMAC bucket key", async () => {
    mocks.upsert.mockResolvedValue({ count: 1 });
    await expect(enforceSubjectRateLimit({
      scope: "auth:login-identifier",
      subject: "user@example.com",
      policy: { limit: 10, windowMs: 15 * 60_000 },
      now,
    })).resolves.toBeUndefined();
    const write = mocks.upsert.mock.calls[0][0];
    expect(write.where.key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(write)).not.toContain("user@example.com");
  });

  it("counts a distinct CBT question once per identity/window", async () => {
    mocks.upsert.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 45 });
    await expect(enforceDistinctRequestLimit({
      headers: requestHeaders,
      scope: "cbt:distinct-question",
      distinctValue: "question-45",
      policy: { limit: 45, windowMs: 10 * 60_000 },
      now,
    })).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(2);

    mocks.upsert.mockReset();
    mocks.upsert.mockResolvedValueOnce({ count: 2 });
    await expect(enforceDistinctRequestLimit({
      headers: requestHeaders,
      scope: "cbt:distinct-question",
      distinctValue: "question-45",
      policy: { limit: 45, windowMs: 10 * 60_000 },
      now,
    })).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("throttles the next distinct CBT question without requiring login", async () => {
    mocks.upsert.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 46 });
    await expect(enforceDistinctRequestLimit({
      headers: requestHeaders,
      scope: "cbt:distinct-question",
      distinctValue: "question-46",
      policy: { limit: 45, windowMs: 10 * 60_000 },
      now,
    })).rejects.toBeInstanceOf(SecurityRateLimitError);
  });

  it("fails closed when no sufficiently strong server secret is configured", () => {
    vi.stubEnv("SUPPORT_ABUSE_HASH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => buildServerRequestKey({
      headers: requestHeaders,
      scope: "test",
      windowMs: 60_000,
      now,
    })).toThrow("SECURITY_ABUSE_PROTECTION_NOT_CONFIGURED");
  });

  it("requires the dedicated abuse secret in production instead of AUTH_SECRET fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPPORT_ABUSE_HASH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "a".repeat(48));
    expect(() => buildServerRequestKey({
      headers: requestHeaders,
      scope: "test",
      windowMs: 60_000,
      now,
    })).toThrow("SECURITY_ABUSE_PROTECTION_NOT_CONFIGURED");
  });
});
