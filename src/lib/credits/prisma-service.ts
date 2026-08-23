import { Prisma } from "@/generated/prisma/client";
import { IdempotencyConflictError, NegativeBalanceError } from "./types";

type CreditPrismaTx = {
  $queryRaw<T = unknown>(query: unknown): Promise<T>;
  creditAccount: {
    findUnique(args: { where: { companyId: string } }): Promise<{ id: string; companyId: string; balance: number } | null>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  creditGrant: {
    findMany(args: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<Array<{ id: string; remainingAmount: number; expiresAt: Date | null; createdAt: Date }>>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  creditTransaction: {
    findUnique(args: { where: { companyId_idempotencyKey: { companyId: string; idempotencyKey: string } } }): Promise<CreditTransactionRecord | null>;
    create(args: { data: Record<string, unknown> }): Promise<CreditTransactionRecord>;
  };
};

type CreditTransactionRecord = {
  id: string;
  companyId: string;
  actorUserId: string | null;
  allowanceType: "MATCH" | "CONTACT_UNLOCK" | null;
  amountDelta: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
};

export type PaidCreditConsumeInput = {
  companyId: string;
  actorUserId: string;
  amount: number;
  allowanceType: "MATCH" | "CONTACT_UNLOCK";
  idempotencyKey: string;
  referenceType: "LeadMatch" | "LeadContactUnlock";
  referenceId: string;
  source: string;
  now?: Date;
};

export type PaidCreditConsumeResult = {
  consumed: boolean;
  alreadyConsumed: boolean;
  transaction: CreditTransactionRecord;
};

function assertPaidCreditInput(input: PaidCreditConsumeInput): void {
  if (!input.companyId.trim()) throw new Error("COMPANY_REQUIRED");
  if (!input.actorUserId.trim()) throw new Error("ACTOR_REQUIRED");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("INVALID_CREDIT_AMOUNT");
  if (!input.idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (!input.referenceId.trim()) throw new Error("REFERENCE_REQUIRED");
}

function sameLogicalOperation(existing: CreditTransactionRecord, input: PaidCreditConsumeInput): boolean {
  return existing.allowanceType === input.allowanceType &&
    existing.referenceType === input.referenceType &&
    existing.referenceId === input.referenceId &&
    existing.amountDelta === -input.amount;
}

function sortGenericGrants(grants: Array<{ id: string; remainingAmount: number; expiresAt: Date | null; createdAt: Date }>) {
  return [...grants].sort((a, b) => {
    if (a.expiresAt === null && b.expiresAt !== null) return 1;
    if (a.expiresAt !== null && b.expiresAt === null) return -1;
    const expiry = (a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
    return expiry || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Gate 5 internal paid-credit boundary. The caller owns the outer Prisma
 * transaction that also writes the LeadMatch/LeadContactUnlock row.
 */
export async function consumeGenericCompanyCreditsInTransaction(
  tx: CreditPrismaTx,
  input: PaidCreditConsumeInput,
): Promise<PaidCreditConsumeResult> {
  assertPaidCreditInput(input);
  const now = input.now ?? new Date();

  // Serialize all economic mutations for one Company before checking the
  // idempotency key, balance projection, and generic paid grants.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "credit_accounts" WHERE "companyId" = ${input.companyId} FOR UPDATE`);
  const existing = await tx.creditTransaction.findUnique({
    where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    if (!sameLogicalOperation(existing, input)) throw new IdempotencyConflictError();
    return { consumed: false, alreadyConsumed: true, transaction: existing };
  }

  const account = await tx.creditAccount.findUnique({ where: { companyId: input.companyId } });
  if (!account) throw new NegativeBalanceError("Credit account is not available");

  const grants = sortGenericGrants(await tx.creditGrant.findMany({
    where: {
      companyId: input.companyId,
      allowanceType: null,
      remainingAmount: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, remainingAmount: true, expiresAt: true, createdAt: true },
  }));
  let remaining = input.amount;
  const selected: Array<{ id: string; amount: number }> = [];
  for (const grant of grants) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, grant.remainingAmount);
    selected.push({ id: grant.id, amount });
    remaining -= amount;
  }
  if (remaining > 0 || account.balance < input.amount) {
    throw new NegativeBalanceError(`Insufficient generic Company credit: need ${input.amount}`);
  }

  for (const grant of selected) {
    const updated = await tx.creditGrant.updateMany({
      where: { id: grant.id, remainingAmount: { gte: grant.amount } },
      data: { remainingAmount: { decrement: grant.amount } },
    });
    if (updated.count !== 1) throw new Error("CREDIT_GRANT_CONCURRENCY_CONFLICT");
  }

  const updatedAccount = await tx.creditAccount.updateMany({
    where: { id: account.id, balance: { gte: input.amount } },
    data: { balance: { decrement: input.amount } },
  });
  if (updatedAccount.count !== 1) throw new NegativeBalanceError("Credit balance changed during consumption");

  const transaction = await tx.creditTransaction.create({
    data: {
      creditAccountId: account.id,
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      type: "CONSUME",
      allowanceType: input.allowanceType,
      amountDelta: -input.amount,
      balanceAfter: account.balance - input.amount,
      source: input.source,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
    },
  });
  return { consumed: true, alreadyConsumed: false, transaction };
}
