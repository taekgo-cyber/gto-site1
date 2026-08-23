import { canMatchOrUnlock, resolveActiveCompanyActor } from "@/lib/leads/authorization";
import { prisma } from "@/lib/prisma";
import {
  ensureQuotaUsage,
  findQuotaConsumptionByIdempotency,
  findQuotaUsage,
  incrementQuotaUsageIfAvailable,
  type QuotaAllowanceTypeValue,
  type QuotaDalDb,
  type QuotaEntitlementRecord,
  type QuotaUsageRecord,
} from "./dal";
import {
  getRemainingWeeklyMatchQuota,
  getWeeklyQuotaWindow,
  selectHighestActiveTier,
  type WeeklyQuotaWindow,
} from "./policy";
import type { ActiveCompanyEntitlement } from "@/lib/monetization/types";
import type { RecruitmentTier } from "@/lib/monetization/policy";

const quotaDb = prisma as unknown as QuotaDalDb;

export type QuotaStatus = {
  companyId: string;
  allowanceType: QuotaAllowanceTypeValue;
  recruitmentTier: RecruitmentTier;
  windowStart: Date;
  windowEnd: Date;
  cap: number;
  consumedCount: number;
  remaining: number;
  canConsume: boolean;
};

export type QuotaConsumeStatus = "CONSUMED" | "ALREADY_CONSUMED" | "NO_QUOTA";

export type QuotaConsumeResult = QuotaStatus & {
  status: QuotaConsumeStatus;
  consumptionId: string | null;
};

export class QuotaIdempotencyConflictError extends Error {
  constructor(message = "Quota idempotency key conflicts with a different logical operation") {
    super(message);
    this.name = "QuotaIdempotencyConflictError";
  }
}

export type QuotaServiceInput = {
  actorUserId: string;
  companyId: string;
  allowanceType: QuotaAllowanceTypeValue;
  idempotencyKey: string;
  operationId?: string | null;
  now?: Date;
};

function assertInput(input: QuotaServiceInput): void {
  if (!input.actorUserId?.trim()) throw new Error("ACTOR_REQUIRED");
  if (!input.companyId?.trim()) throw new Error("COMPANY_REQUIRED");
  if (!input.idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (input.now !== undefined && Number.isNaN(input.now.getTime())) throw new Error("INVALID_NOW");
  if (input.allowanceType !== "MATCH" && input.allowanceType !== "CONTACT_UNLOCK") {
    throw new Error("INVALID_ALLOWANCE_TYPE");
  }
}

async function assertQuotaActor(input: QuotaServiceInput) {
  const authorization = await resolveActiveCompanyActor(input.actorUserId, input.companyId);
  if (!authorization.ok) throw new Error(authorization.code);
  if (!canMatchOrUnlock(authorization.actor)) throw new Error("ROLE_NOT_ALLOWED");
  return authorization.actor;
}

function toActiveEntitlements(rows: QuotaEntitlementRecord[]): ActiveCompanyEntitlement[] {
  return rows.map((row) => ({
    companyId: row.companyId,
    recruitmentTier: row.recruitmentTier,
    validFrom: row.validFrom,
    expiresAt: row.expiresAt,
  }));
}

async function getEntitlements(db: QuotaDalDb, companyId: string): Promise<QuotaEntitlementRecord[]> {
  return db.companyRecruitmentEntitlement.findMany({
    where: { companyId },
    select: { companyId: true, recruitmentTier: true, validFrom: true, expiresAt: true },
  });
}

function resolveCap(allowanceType: QuotaAllowanceTypeValue, tier: RecruitmentTier): number {
  return allowanceType === "MATCH" ? getRemainingWeeklyMatchQuota(tier, 0) : 0;
}

function buildStatus(input: {
  companyId: string;
  allowanceType: QuotaAllowanceTypeValue;
  tier: RecruitmentTier;
  window: WeeklyQuotaWindow;
  usage: QuotaUsageRecord | null;
}): QuotaStatus {
  const cap = resolveCap(input.allowanceType, input.tier);
  const consumedCount = input.usage?.consumedCount ?? 0;
  const remaining = Math.max(0, cap - consumedCount);
  return {
    companyId: input.companyId,
    allowanceType: input.allowanceType,
    recruitmentTier: input.tier,
    windowStart: input.window.start,
    windowEnd: input.window.end,
    cap,
    consumedCount,
    remaining,
    canConsume: remaining > 0,
  };
}

async function readQuotaStatus(db: QuotaDalDb, input: QuotaServiceInput, now: Date): Promise<QuotaStatus> {
  const window = getWeeklyQuotaWindow(now);
  const entitlements = await getEntitlements(db, input.companyId);
  const tier = selectHighestActiveTier(toActiveEntitlements(entitlements), now);
  const usage = await findQuotaUsage(db, {
    companyId: input.companyId,
    allowanceType: input.allowanceType,
    windowStart: window.start,
  });
  return buildStatus({ companyId: input.companyId, allowanceType: input.allowanceType, tier, window, usage });
}

async function consumeQuotaInTransaction(input: QuotaServiceInput, tx: QuotaDalDb): Promise<QuotaConsumeResult> {
  const now = input.now ?? new Date();
  const window = getWeeklyQuotaWindow(now);
  const existing = await findQuotaConsumptionByIdempotency(tx, {
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
  });
  const existingUsage = existing ? await findQuotaUsage(tx, {
    companyId: input.companyId,
    allowanceType: input.allowanceType,
    windowStart: window.start,
  }) : null;
  if (existing && (
    !existingUsage ||
    existing.quotaUsageId !== existingUsage.id ||
    existing.allowanceType !== input.allowanceType ||
    existing.operationReference !== (input.operationId ?? null)
  )) {
    throw new QuotaIdempotencyConflictError();
  }
  const entitlements = await getEntitlements(tx, input.companyId);
  const tier = selectHighestActiveTier(toActiveEntitlements(entitlements), now);
  const cap = resolveCap(input.allowanceType, tier);

  if (existing) {
    return resultFromStatus(buildStatus({ companyId: input.companyId, allowanceType: input.allowanceType, tier, window, usage: existingUsage }), "ALREADY_CONSUMED", existing.id);
  }

  if (cap === 0) {
    return resultFromStatus(buildStatus({ companyId: input.companyId, allowanceType: input.allowanceType, tier, window, usage: null }), "NO_QUOTA", null);
  }

  const usage = await ensureQuotaUsage(tx, {
    companyId: input.companyId,
    allowanceType: input.allowanceType,
    windowStart: window.start,
    windowEnd: window.end,
    now,
  });
  const incremented = await incrementQuotaUsageIfAvailable(tx, { usageId: usage.id, cap });
  if (!incremented) {
    const current = await findQuotaUsage(tx, {
      companyId: input.companyId,
      allowanceType: input.allowanceType,
      windowStart: window.start,
    });
    return resultFromStatus(buildStatus({ companyId: input.companyId, allowanceType: input.allowanceType, tier, window, usage: current }), "NO_QUOTA", null);
  }

  const consumption = await tx.companyQuotaConsumption.create({
    data: {
      companyId: input.companyId,
      quotaUsageId: usage.id,
      allowanceType: input.allowanceType,
      idempotencyKey: input.idempotencyKey,
      operationReference: input.operationId ?? null,
      consumedCount: 1,
    },
  });
  const current = await findQuotaUsage(tx, {
    companyId: input.companyId,
    allowanceType: input.allowanceType,
    windowStart: window.start,
  });
  return resultFromStatus(buildStatus({ companyId: input.companyId, allowanceType: input.allowanceType, tier, window, usage: current }), "CONSUMED", consumption.id);
}

/**
 * Internal Gate 5 boundary. The caller must already be inside the authoritative
 * transaction that will also write the Lead domain row.
 */
export async function consumeCompanyQuotaInTransaction(
  input: QuotaServiceInput,
  tx: QuotaDalDb,
): Promise<QuotaConsumeResult> {
  assertInput(input);
  return consumeQuotaInTransaction(input, tx);
}

export async function getCompanyQuotaStatus(
  input: Omit<QuotaServiceInput, "idempotencyKey"> & { idempotencyKey?: string },
  db: QuotaDalDb = quotaDb,
): Promise<QuotaStatus> {
  const normalized = { ...input, idempotencyKey: input.idempotencyKey ?? "quota-status" };
  assertInput(normalized);
  await assertQuotaActor(normalized);
  return readQuotaStatus(db, normalized, normalized.now ?? new Date());
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function resultFromStatus(status: QuotaStatus, outcome: QuotaConsumeStatus, consumptionId: string | null): QuotaConsumeResult {
  return { ...status, status: outcome, consumptionId };
}

export async function consumeCompanyQuota(
  input: QuotaServiceInput,
  db: QuotaDalDb = quotaDb,
): Promise<QuotaConsumeResult> {
  assertInput(input);
  await assertQuotaActor(input);
  const now = input.now ?? new Date();
  const run = db.$transaction ? <T>(fn: (tx: QuotaDalDb) => Promise<T>) => db.$transaction!(fn) : <T>(fn: (tx: QuotaDalDb) => Promise<T>) => fn(db);

  try {
    return await run((tx) => consumeQuotaInTransaction(input, tx));
  } catch (error) {
    // A concurrent retry may win the unique companyId+idempotencyKey insert.
    // Never expose raw Prisma P2002 to the caller; resolve it as an idempotent replay.
    if (isUniqueConstraintError(error)) {
      const existing = await findQuotaConsumptionByIdempotency(db, {
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) {
        const usage = await findQuotaUsage(db, {
          companyId: input.companyId,
          allowanceType: input.allowanceType,
          windowStart: getWeeklyQuotaWindow(now).start,
        });
        if (!usage || existing.quotaUsageId !== usage.id || existing.allowanceType !== input.allowanceType || existing.operationReference !== (input.operationId ?? null)) {
          throw new QuotaIdempotencyConflictError();
        }
        const status = await readQuotaStatus(db, input, now);
        return resultFromStatus(status, "ALREADY_CONSUMED", existing.id);
      }
    }
    throw error;
  }
}
