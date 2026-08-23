/**
 * Credit Ledger Service - Gate 3 STATIC/ISOLATED foundation
 * - Append-only CreditTransaction; ledger is source of truth.
 * - Negative credit balance prevention contract (atomic).
 * - Idempotency prevents duplicate grant/consume via companyId+idempotencyKey unique.
 * - Company-owned: economic owner is Company; actorUserId is distinct provenance.
 * - Nullable expiresAt, no fixed policy; expiry-aware selection is FIFO by expiresAt (nulls last).
 * - Match vs ContactUnlock allowance distinct via CreditAllowanceType.
 * - No arbitrary balance mutation exposed; projection updated only within ledger append transaction.
 * - In-memory implementation for foundation/unit tests; Prisma-backed variant mirrors same contracts.
 */

import {
  asCreditAmount,
  assertCompanyOwnership,
  assertLedgerAmountDelta,
  NegativeBalanceError,
  selectGrantsForConsumption,
  type CreditAccount,
  type CreditAllowanceType,
  type CreditAmount,
  type CreditGrant,
  type CreditTransaction,
  type CreditTransactionType,
} from "./types";

export type InMemoryCreditDb = {
  accounts: Map<string, CreditAccount>; // key: companyId
  grants: Map<string, CreditGrant[]>; // key: companyId
  transactions: Map<string, CreditTransaction[]>; // key: companyId
  transactionsByKey: Map<string, CreditTransaction>; // key: `${companyId}:${idempotencyKey}`
};

export function createInMemoryCreditDb(): InMemoryCreditDb {
  return {
    accounts: new Map(),
    grants: new Map(),
    transactions: new Map(),
    transactionsByKey: new Map(),
  };
}

function ledgerBalance(transactions: CreditTransaction[]): CreditAmount {
  const sum = transactions.reduce((s, t) => s + t.amountDelta, 0);
  return asCreditAmount(sum);
}

function ensureAccount(db: InMemoryCreditDb, companyId: string): CreditAccount {
  const existing = db.accounts.get(companyId);
  if (existing) return existing;
  const now = new Date();
  const account: CreditAccount = {
    id: `ca_${companyId}`,
    companyId,
    balance: asCreditAmount(0),
    createdAt: now,
    updatedAt: now,
  };
  db.accounts.set(companyId, account);
  db.grants.set(companyId, []);
  db.transactions.set(companyId, []);
  return account;
}

export type GrantCreditsInput = {
  companyId: string;
  actorUserId?: string | null;
  amount: CreditAmount;
  allowanceType?: CreditAllowanceType | null;
  source: string;
  referenceId?: string | null;
  expiresAt?: Date | null;
  idempotencyKey: string;
};

export type ConsumeCreditsInput = {
  companyId: string;
  actorUserId?: string | null;
  amount: CreditAmount;
  allowanceType: CreditAllowanceType;
  source?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey: string;
};

export type LedgerResult = {
  transaction: CreditTransaction;
  account: CreditAccount;
};

// Append-only grant: creates CreditGrant batch + GRANT transaction atomically (in-memory atomic)
export function grantCredits(db: InMemoryCreditDb, input: GrantCreditsInput): LedgerResult {
  assertCompanyOwnership(input.companyId, input.actorUserId ?? null);
  if (!Number.isInteger(input.amount as number) || (input.amount as number) <= 0)
    throw new Error("amount must be positive integer credit");
  if (!input.source?.trim()) throw new Error("source required");
  if (!input.idempotencyKey?.trim()) throw new Error("idempotencyKey required");
  if (input.expiresAt !== undefined && input.expiresAt !== null && !(input.expiresAt instanceof Date))
    throw new Error("expiresAt must be Date or null");

  const key = `${input.companyId}:${input.idempotencyKey}`;
  const existing = db.transactionsByKey.get(key);
  if (existing) {
    // Idempotent replay - return existing without duplicate grant
    const account = db.accounts.get(input.companyId);
    if (!account) throw new Error("account missing for idempotent replay");
    return { transaction: existing, account };
  }

  const account = ensureAccount(db, input.companyId);
  const now = new Date();
  const grantId = `grant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const grant: CreditGrant = {
    id: grantId,
    companyId: input.companyId,
    creditAccountId: account.id,
    allowanceType: input.allowanceType ?? null,
    source: input.source,
    referenceId: input.referenceId ?? null,
    amount: input.amount,
    remainingAmount: input.amount,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic: update projection + grant list + ledger
  const amountDelta = input.amount as number;
  const newBalance = asCreditAmount((account.balance as number) + amountDelta);
  const tx: CreditTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    creditAccountId: account.id,
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? null,
    type: "GRANT" as CreditTransactionType,
    allowanceType: input.allowanceType ?? null,
    amountDelta,
    balanceAfter: newBalance,
    source: input.source,
    referenceType: "CreditGrant",
    referenceId: grantId,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
  };

  assertLedgerAmountDelta(tx.amountDelta);
  if ((newBalance as number) < 0) throw new NegativeBalanceError();

  // Mutate db atomically
  account.balance = newBalance;
  account.updatedAt = now;
  const grants = db.grants.get(input.companyId)!;
  grants.push(grant);
  const txs = db.transactions.get(input.companyId)!;
  txs.push(tx);
  db.transactionsByKey.set(key, tx);

  return { transaction: tx, account };
}

// Append-only consume: selects expiry-aware grants, decrements remaining, creates CONSUME transaction
export function consumeCredits(db: InMemoryCreditDb, input: ConsumeCreditsInput): LedgerResult {
  assertCompanyOwnership(input.companyId, input.actorUserId ?? null);
  if (!Number.isInteger(input.amount as number) || (input.amount as number) <= 0)
    throw new Error("amount must be positive integer credit");
  if (!input.idempotencyKey?.trim()) throw new Error("idempotencyKey required");

  const key = `${input.companyId}:${input.idempotencyKey}`;
  const existing = db.transactionsByKey.get(key);
  if (existing) {
    const account = db.accounts.get(input.companyId);
    if (!account) throw new Error("account missing for idempotent replay");
    return { transaction: existing, account };
  }

  const account = ensureAccount(db, input.companyId);
  const txs = db.transactions.get(input.companyId)!;
  const currentBalance = ledgerBalance(txs);
  // Negative balance contract: consume must not make balance negative
  if ((currentBalance as number) < (input.amount as number)) {
    throw new NegativeBalanceError(`Insufficient balance: have ${currentBalance}, need ${input.amount}`);
  }

  // Generic paid grants are eligible for either purpose; typed free/promotion grants
  // are eligible only for their matching operation purpose.
  const allGrants = db.grants.get(input.companyId) ?? [];
  const eligibleGrants = allGrants.filter(
    (g) => g.allowanceType === null || g.allowanceType === input.allowanceType,
  );
  const selection = selectGrantsForConsumption(eligibleGrants as CreditGrant[], input.amount, new Date());

  // Atomic decrement of remainingAmount on selected grants
  for (const sel of selection.selectedGrants) {
    const g = allGrants.find((x) => x.id === sel.grantId);
    if (!g) throw new Error("grant missing during consumption");
    g.remainingAmount = asCreditAmount((g.remainingAmount as number) - (sel.amount as number));
    g.updatedAt = new Date();
  }

  const now = new Date();
  const amountDelta = -(input.amount as number);
  const newBalance = asCreditAmount((account.balance as number) + amountDelta);
  if ((newBalance as number) < 0) throw new NegativeBalanceError();

  const tx: CreditTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    creditAccountId: account.id,
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? null,
    type: "CONSUME" as CreditTransactionType,
    allowanceType: input.allowanceType,
    amountDelta,
    balanceAfter: newBalance,
    source: input.source ?? null,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
  };

  assertLedgerAmountDelta(tx.amountDelta);

  account.balance = newBalance;
  account.updatedAt = now;
  txs.push(tx);
  db.transactionsByKey.set(key, tx);

  return { transaction: tx, account };
}

// Read helpers - ledger is source of truth
export function getBalance(db: InMemoryCreditDb, companyId: string): CreditAmount {
  const txs = db.transactions.get(companyId) ?? [];
  return ledgerBalance(txs as CreditTransaction[]);
}

export function getTransactions(db: InMemoryCreditDb, companyId: string): CreditTransaction[] {
  return [...(db.transactions.get(companyId) ?? [])];
}

export function getGrants(db: InMemoryCreditDb, companyId: string, allowanceType?: CreditAllowanceType): CreditGrant[] {
  const all = db.grants.get(companyId) ?? [];
  if (allowanceType) return all.filter((g) => g.allowanceType === allowanceType);
  return [...all];
}

// No unsafe direct mutation export - balance can only change via grantCredits/consumeCredits (append-only)
