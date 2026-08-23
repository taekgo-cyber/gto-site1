/**
 * Gate 4 quota DAL contract. Aggregate usage and append-only consumption events
 * are database-backed; no process-memory counter is used by this boundary.
 */

export type QuotaAllowanceTypeValue = "MATCH" | "CONTACT_UNLOCK";

export type QuotaUsageRecord = {
  id: string;
  companyId: string;
  allowanceType: QuotaAllowanceTypeValue;
  windowStart: Date;
  windowEnd: Date;
  consumedCount: number;
};

export type QuotaConsumptionRecord = {
  id: string;
  companyId: string;
  quotaUsageId: string;
  allowanceType: QuotaAllowanceTypeValue;
  idempotencyKey: string;
  operationReference: string | null;
  consumedCount: number;
};

export type QuotaEntitlementRecord = {
  companyId: string;
  recruitmentTier: "GENERAL" | "PREMIUM" | "MAIN";
  validFrom: Date;
  expiresAt: Date | null;
};

export type QuotaDalDb = {
  companyRecruitmentEntitlement: {
    findMany(args: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<QuotaEntitlementRecord[]>;
  };
  companyQuotaUsage: {
    findUnique(args: { where: Record<string, unknown> }): Promise<QuotaUsageRecord | null>;
    upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<QuotaUsageRecord>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  companyQuotaConsumption: {
    findUnique(args: { where: Record<string, unknown> }): Promise<QuotaConsumptionRecord | null>;
    create(args: { data: Record<string, unknown> }): Promise<QuotaConsumptionRecord>;
  };
  $transaction?<T>(fn: (tx: QuotaDalDb) => Promise<T>): Promise<T>;
};

export async function findQuotaUsage(
  db: QuotaDalDb,
  input: { companyId: string; allowanceType: QuotaAllowanceTypeValue; windowStart: Date },
): Promise<QuotaUsageRecord | null> {
  return db.companyQuotaUsage.findUnique({
    where: { companyId_allowanceType_windowStart: input },
  });
}

export async function findQuotaConsumptionByIdempotency(
  db: QuotaDalDb,
  input: { companyId: string; idempotencyKey: string },
): Promise<QuotaConsumptionRecord | null> {
  return db.companyQuotaConsumption.findUnique({
    where: { companyId_idempotencyKey: input },
  });
}

export async function ensureQuotaUsage(
  db: QuotaDalDb,
  input: {
    companyId: string;
    allowanceType: QuotaAllowanceTypeValue;
    windowStart: Date;
    windowEnd: Date;
    now: Date;
  },
): Promise<QuotaUsageRecord> {
  return db.companyQuotaUsage.upsert({
    where: {
      companyId_allowanceType_windowStart: {
        companyId: input.companyId,
        allowanceType: input.allowanceType,
        windowStart: input.windowStart,
      },
    },
    create: {
      companyId: input.companyId,
      allowanceType: input.allowanceType,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      consumedCount: 0,
      createdAt: input.now,
      updatedAt: input.now,
    },
    update: {},
  });
}

export async function incrementQuotaUsageIfAvailable(
  db: QuotaDalDb,
  input: { usageId: string; cap: number },
): Promise<boolean> {
  const result = await db.companyQuotaUsage.updateMany({
    where: { id: input.usageId, consumedCount: { lt: input.cap } },
    data: { consumedCount: { increment: 1 } },
  });
  return result.count === 1;
}
