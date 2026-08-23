/**
 * Gate 4 quota DAL contract. Aggregate usage and append-only consumption events
 * are database-backed; no process-memory counter is used by this boundary.
 */

export type QuotaDalDb = {
  companyQuotaUsage: {
    findUnique(args: { where: { companyId_allowanceType_windowStart: { companyId: string; allowanceType: string; windowStart: Date } } }): Promise<unknown | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  companyQuotaConsumption: {
    findUnique(args: { where: { companyId_idempotencyKey: { companyId: string; idempotencyKey: string } } }): Promise<unknown | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  $transaction?<T>(fn: (tx: QuotaDalDb) => Promise<T>): Promise<T>;
};

export async function findQuotaUsage(
  db: QuotaDalDb,
  input: { companyId: string; allowanceType: string; windowStart: Date },
): Promise<unknown | null> {
  return db.companyQuotaUsage.findUnique({
    where: { companyId_allowanceType_windowStart: input },
  });
}

export async function findQuotaConsumptionByIdempotency(
  db: QuotaDalDb,
  input: { companyId: string; idempotencyKey: string },
): Promise<unknown | null> {
  return db.companyQuotaConsumption.findUnique({
    where: { companyId_idempotencyKey: input },
  });
}
