/**
 * Monetization Credit/Ledger Foundation - Session 13 Gate 3 (STATIC/ISOLATED)
 * - Economic owner is Company (companyId); actorUserId is distinct provenance.
 * - Money KRW integer and Credit integer are conceptually separate (branded types, no conversion/pricing).
 * - Ledger is source of truth; balance projection is cached and never mutated outside ledger append.
 * - No product/price numbers, quota numeric constants, or actual policy.
 */

// Branded nominal types to keep KRW and Credit conceptually separate.
// Both are integers; runtime validation ensures integer >=0 where applicable.
export type CreditAmount = number & { readonly __brand: "CreditAmount" };
export type MoneyKRW = number & { readonly __brand: "MoneyKRW" };

export function asCreditAmount(n: number): CreditAmount {
  if (!Number.isInteger(n)) throw new Error("CreditAmount must be integer");
  return n as CreditAmount;
}

export function asMoneyKRW(n: number): MoneyKRW {
  if (!Number.isInteger(n)) throw new Error("MoneyKRW must be integer");
  return n as MoneyKRW;
}

// Distinct allowance types - Match and ContactUnlock must not be conflated.
export const CreditAllowanceType = {
  MATCH: "MATCH",
  CONTACT_UNLOCK: "CONTACT_UNLOCK",
} as const;
export type CreditAllowanceType = (typeof CreditAllowanceType)[keyof typeof CreditAllowanceType];

export const CreditTransactionType = {
  GRANT: "GRANT",
  CONSUME: "CONSUME",
  ADJUSTMENT: "ADJUSTMENT",
  EXPIRE: "EXPIRE",
} as const;
export type CreditTransactionType = (typeof CreditTransactionType)[keyof typeof CreditTransactionType];

// Company-owned account projection. Ledger remains source of truth.
export type CreditAccount = {
  id: string;
  companyId: string;
  balance: CreditAmount;
  createdAt: Date;
  updatedAt: Date;
};

// Grant/Batch - source is provenance string, expiresAt nullable with no fixed policy.
export type CreditGrant = {
  id: string;
  companyId: string;
  creditAccountId: string;
  // Null is a generic paid Company credit grant; non-null is free/promotion quota provenance.
  allowanceType: CreditAllowanceType | null;
  source: string;
  referenceId: string | null;
  amount: CreditAmount;
  remainingAmount: CreditAmount;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Append-only ledger row with provenance and idempotency.
export type CreditTransaction = {
  id: string;
  creditAccountId: string;
  companyId: string;
  actorUserId: string | null;
  type: CreditTransactionType;
  allowanceType: CreditAllowanceType | null;
  amountDelta: number; // CreditAmount signed: +grant, -consume; kept as number for sign
  balanceAfter: CreditAmount;
  source: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  createdAt: Date;
};

// Foundation entitlement - distinct fields prevent conflation; no numeric defaults.
export type QuotaEntitlementFoundation = {
  companyId: string;
  matchAllowance: {
    type: typeof CreditAllowanceType.MATCH;
    grants: CreditGrant[];
  };
  contactUnlockAllowance: {
    type: typeof CreditAllowanceType.CONTACT_UNLOCK;
    grants: CreditGrant[];
  };
};

// Expiry-aware selection result structure.
export type GrantSelection = {
  selectedGrants: Array<{ grantId: string; amount: CreditAmount; expiresAt: Date | null }>;
  totalSelected: CreditAmount;
};

// Negative balance prevention contract
export class NegativeBalanceError extends Error {
  constructor(message = "Credit balance cannot be negative") {
    super(message);
    this.name = "NegativeBalanceError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = "Idempotent key already processed") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

// Helpers
export function isGrantExpired(grant: Pick<CreditGrant, "expiresAt">, now: Date = new Date()): boolean {
  if (grant.expiresAt === null) return false;
  return grant.expiresAt.getTime() <= now.getTime();
}

export function isGrantUsable(
  grant: Pick<CreditGrant, "expiresAt" | "remainingAmount">,
  now: Date = new Date(),
): boolean {
  if (grant.remainingAmount <= 0) return false;
  return !isGrantExpired(grant, now);
}

/**
 * Expiry-aware selection: earliest expiresAt first, nulls last, then createdAt asc.
 * Does not mutate grants; caller must decrement remainingAmount after selection.
 * Foundation only - no fixed expiry policy encoded.
 */
export function selectGrantsForConsumption(
  grants: CreditGrant[],
  amount: CreditAmount,
  now: Date = new Date(),
): GrantSelection {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be positive integer");
  const usable = grants.filter((g) => isGrantUsable(g, now));
  const sorted = [...usable].sort((a, b) => {
    // Operation-specific free/promotion grants are consumed before generic paid credit.
    const aGeneric = a.allowanceType === null;
    const bGeneric = b.allowanceType === null;
    if (aGeneric !== bGeneric) return aGeneric ? 1 : -1;
    if (a.expiresAt === null && b.expiresAt === null) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    if (a.expiresAt === null) return 1;
    if (b.expiresAt === null) return -1;
    const diff = (a.expiresAt as Date).getTime() - (b.expiresAt as Date).getTime();
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let remaining = amount as number;
  const selected: GrantSelection["selectedGrants"] = [];
  for (const g of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(g.remainingAmount as number, remaining);
    selected.push({ grantId: g.id, amount: asCreditAmount(take), expiresAt: g.expiresAt });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new NegativeBalanceError(
      `Insufficient usable credits: need ${amount}, available ${((amount as number) - remaining)}`,
    );
  }
  return { selectedGrants: selected, totalSelected: asCreditAmount(amount as number) };
}

// Validation: ledger append-only and provenance distinct
export function assertCompanyOwnership(companyId: string, actorUserId: string | null): void {
  // actorUserId may be null (system grant) or different from company; must not be conflated with owner
  if (actorUserId !== null && actorUserId === companyId) {
    throw new Error("actorUserId must be distinct from companyId provenance");
  }
}

export function assertLedgerAmountDelta(delta: number): void {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("amountDelta must be non-zero integer");
}
