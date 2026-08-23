/**
 * Credit DAL — foundation only, append-only ledger, Company-owned.
 * Prisma-typed but dependency-free for static foundation; caller injects db client.
 * No direct balance mutation; no update/delete on ledger exposed.
 * Idempotency uniqueness is represented in schema as @@unique([companyId, idempotencyKey]).
 */

import type { CreditAccount, CreditGrant, CreditTransaction } from "./types";

// Minimal db shape mirroring Prisma delegate signatures used by foundation.
// Using `any` delegates avoids hard dependency on generated client (not installed in Gate 3 check).
export type CreditDalDb = {
  creditAccount: {
    findUnique(args: { where: { companyId: string } }): Promise<CreditAccount | null>;
    findUniqueById?(args: { where: { id: string } }): Promise<CreditAccount | null>;
    create(args: { data: Omit<CreditAccount, "createdAt" | "updatedAt"> & { createdAt?: Date; updatedAt?: Date } }): Promise<CreditAccount>;
    update?(args: { where: { id: string }; data: Partial<CreditAccount> }): Promise<CreditAccount>;
  };
  creditGrant: {
    findMany(args: { where: { companyId: string; allowanceType?: string } }): Promise<CreditGrant[]>;
    findUnique?(args: { where: { id: string } }): Promise<CreditGrant | null>;
    create(args: { data: Omit<CreditGrant, "createdAt" | "updatedAt"> & { createdAt?: Date; updatedAt?: Date } }): Promise<CreditGrant>;
  };
  creditTransaction: {
    findUnique(args: { where: { companyId_idempotencyKey: { companyId: string; idempotencyKey: string } } }): Promise<CreditTransaction | null>;
    findFirst?(args: { where: { idempotencyKey: string } }): Promise<CreditTransaction | null>;
    findMany(args: { where: { companyId: string } }): Promise<CreditTransaction[]>;
    create(args: { data: Omit<CreditTransaction, "createdAt"> & { createdAt?: Date } }): Promise<CreditTransaction>;
    // No update/delete exposed — append-only
  };
  $transaction?<T>(fn: (tx: CreditDalDb) => Promise<T>): Promise<T>;
};

export async function getCreditAccountByCompanyId(db: CreditDalDb, companyId: string): Promise<CreditAccount | null> {
  return db.creditAccount.findUnique({ where: { companyId } });
}

export async function getCreditGrantsByCompany(
  db: CreditDalDb,
  companyId: string,
  allowanceType?: string,
): Promise<CreditGrant[]> {
  return db.creditGrant.findMany({ where: { companyId, ...(allowanceType ? { allowanceType } : {}) } });
}

export async function getCreditTransactionsByCompany(
  db: CreditDalDb,
  companyId: string,
): Promise<CreditTransaction[]> {
  return db.creditTransaction.findMany({ where: { companyId } });
}

export async function findTransactionByIdempotency(
  db: CreditDalDb,
  companyId: string,
  idempotencyKey: string,
): Promise<CreditTransaction | null> {
  return db.creditTransaction.findUnique({ where: { companyId_idempotencyKey: { companyId, idempotencyKey } } });
}

// Ledger is source of truth; compute balance from transactions if needed
export function computeBalanceFromLedger(transactions: Pick<CreditTransaction, "amountDelta">[]): number {
  return transactions.reduce((sum, t) => sum + t.amountDelta, 0);
}

// Expose no unsafe direct mutation: dal does not export balance update; service does it transactionally with ledger append.
