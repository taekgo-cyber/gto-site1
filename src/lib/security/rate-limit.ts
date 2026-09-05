import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

type HeaderReader = Pick<Headers, "get">;

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export const SECURITY_RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  cbtAnswer: { limit: 60, windowMs: 10 * 60_000 },
  cbtDistinctQuestions: { limit: 45, windowMs: 10 * 60_000 },
  cbtExamSubmit: { limit: 8, windowMs: 60 * 60_000 },
  adImpression: { limit: 120, windowMs: 10 * 60_000 },
  adClick: { limit: 30, windowMs: 10 * 60_000 },
  leadUnlock: { limit: 20, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

const BUCKET_RETENTION_MS = 48 * 60 * 60_000;

export class SecurityRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("SECURITY_RATE_LIMITED");
    this.name = "SecurityRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function resolveSecret(): string {
  const dedicated = process.env.SUPPORT_ABUSE_HASH_SECRET ?? "";
  const secret = process.env.NODE_ENV === "production"
    ? dedicated
    : dedicated || process.env.AUTH_SECRET || "";
  if (secret.length < 32) throw new Error("SECURITY_ABUSE_PROTECTION_NOT_CONFIGURED");
  return secret;
}

function firstForwardedValue(value: string | null): string {
  return value?.split(",")[0]?.trim().slice(0, 128) || "anonymous";
}

function requestIdentityMaterial(headers: HeaderReader): string {
  return firstForwardedValue(
    headers.get("x-real-ip") ?? headers.get("x-forwarded-for"),
  );
}

export function rateLimitWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function hmacKey(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function buildServerRequestKey(input: {
  headers: HeaderReader;
  scope: string;
  subject?: string;
  windowMs: number;
  now?: Date;
}): { key: string; windowStart: Date } {
  const secret = resolveSecret();
  const windowStart = rateLimitWindowStart(input.now ?? new Date(), input.windowMs);
  const identity = requestIdentityMaterial(input.headers);
  const key = hmacKey(
    secret,
    `${input.scope}|${input.subject ?? ""}|${identity}|${windowStart.toISOString()}`,
  );
  return { key, windowStart };
}

function retryAfterSeconds(now: Date, windowStart: Date, windowMs: number): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1_000));
}

async function incrementBucket(key: string, windowStart: Date, now: Date): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.supportRateLimitBucket.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - BUCKET_RETENTION_MS) } },
    });
    const bucket = await tx.supportRateLimitBucket.upsert({
      where: { key },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return bucket.count;
  });
}

export async function enforceRequestRateLimit(input: {
  headers: HeaderReader;
  scope: string;
  policy: RateLimitPolicy;
  subject?: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const { key, windowStart } = buildServerRequestKey({
    headers: input.headers,
    scope: input.scope,
    subject: input.subject,
    windowMs: input.policy.windowMs,
    now,
  });
  const count = await incrementBucket(key, windowStart, now);

  if (count > input.policy.limit) {
    throw new SecurityRateLimitError(
      retryAfterSeconds(now, windowStart, input.policy.windowMs),
    );
  }
}

export async function enforceSubjectRateLimit(input: {
  scope: string;
  subject: string;
  policy: RateLimitPolicy;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const windowStart = rateLimitWindowStart(now, input.policy.windowMs);
  const key = hmacKey(
    resolveSecret(),
    `${input.scope}|subject|${input.subject}|${windowStart.toISOString()}`,
  );
  const count = await incrementBucket(key, windowStart, now);
  if (count > input.policy.limit) {
    throw new SecurityRateLimitError(
      retryAfterSeconds(now, windowStart, input.policy.windowMs),
    );
  }
}

export async function enforceDistinctRequestLimit(input: {
  headers: HeaderReader;
  scope: string;
  distinctValue: string;
  policy: RateLimitPolicy;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const secret = resolveSecret();
  const windowStart = rateLimitWindowStart(now, input.policy.windowMs);
  const identity = hmacKey(secret, requestIdentityMaterial(input.headers));
  const counterKey = hmacKey(
    secret,
    `${input.scope}|counter|${identity}|${windowStart.toISOString()}`,
  );
  const markerKey = hmacKey(
    secret,
    `${input.scope}|marker|${identity}|${input.distinctValue}|${windowStart.toISOString()}`,
  );

  const count = await prisma.$transaction(async (tx) => {
    const marker = await tx.supportRateLimitBucket.upsert({
      where: { key: markerKey },
      create: { key: markerKey, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (marker.count > 1) return null;
    const counter = await tx.supportRateLimitBucket.upsert({
      where: { key: counterKey },
      create: { key: counterKey, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return counter.count;
  });

  if (count !== null && count > input.policy.limit) {
    throw new SecurityRateLimitError(
      retryAfterSeconds(now, windowStart, input.policy.windowMs),
    );
  }
}

export function rateLimitResponse(error: SecurityRateLimitError): Response {
  return Response.json(
    { error: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(error.retryAfterSeconds),
      },
    },
  );
}
