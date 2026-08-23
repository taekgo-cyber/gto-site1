import { describe, expect, it } from "vitest";
import { consumeGenericCompanyCreditsInTransaction } from "@/lib/credits/prisma-service";

type CreditTransactionFixture = {
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

function fakeCreditDb(options: { balance: number; grantAmount: number; existing?: CreditTransactionFixture } = { balance: 2_000, grantAmount: 2_000 }) {
  const state = {
    account: { id: "account-1", companyId: "company-1", balance: options.balance },
    grant: { id: "grant-1", remainingAmount: options.grantAmount, expiresAt: null, createdAt: new Date("2026-08-01T00:00:00Z") },
    existing: options.existing ?? null as CreditTransactionFixture | null,
    created: null as CreditTransactionFixture | null,
  };
  const db = {
    $queryRaw: async <T = unknown>() => [] as T,
    creditAccount: {
      findUnique: async () => state.account,
      updateMany: async ({ data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.account.balance -= (data.balance as { decrement: number }).decrement;
        return { count: 1 };
      },
    },
    creditGrant: {
      findMany: async () => [state.grant],
      updateMany: async ({ data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.grant.remainingAmount -= (data.remainingAmount as { decrement: number }).decrement;
        return { count: 1 };
      },
    },
    creditTransaction: {
      findUnique: async () => state.existing,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.created = { id: "tx-1", ...data } as CreditTransactionFixture;
        return state.created;
      },
    },
  };
  return { db, state };
}

const input = {
  companyId: "company-1",
  actorUserId: "actor-1",
  amount: 2_000,
  allowanceType: "MATCH" as const,
  idempotencyKey: "credit:lead-match:company-1:lead-1",
  referenceType: "LeadMatch" as const,
  referenceId: "lead-1",
  source: "LEAD_MATCH_CREDIT",
  now: new Date("2026-08-23T03:00:00Z"),
};

describe("Gate 5 generic Company credit transaction boundary", () => {
  it("consumes generic paid grant and records MATCH provenance", async () => {
    const { db, state } = fakeCreditDb();
    const result = await consumeGenericCompanyCreditsInTransaction(db, input);
    expect(result.consumed).toBe(true);
    expect(state.account.balance).toBe(0);
    expect(state.grant.remainingAmount).toBe(0);
    expect(state.created).toMatchObject({ allowanceType: "MATCH", amountDelta: -2_000, referenceType: "LeadMatch", referenceId: "lead-1" });
  });

  it("rejects insufficient generic credit before ledger/domain success", async () => {
    const { db, state } = fakeCreditDb({ balance: 0, grantAmount: 0 });
    await expect(consumeGenericCompanyCreditsInTransaction(db, input)).rejects.toThrow(/Insufficient generic/);
    expect(state.created).toBeNull();
  });

  it("replays the same logical operation idempotently without a second debit", async () => {
    const existing: CreditTransactionFixture = { id: "tx-existing", companyId: "company-1", actorUserId: "actor-1", allowanceType: "MATCH", amountDelta: -2_000, balanceAfter: 0, referenceType: "LeadMatch", referenceId: "lead-1", idempotencyKey: input.idempotencyKey };
    const { db, state } = fakeCreditDb({ balance: 0, grantAmount: 0, existing });
    const result = await consumeGenericCompanyCreditsInTransaction(db, input);
    expect(result.alreadyConsumed).toBe(true);
    expect(state.created).toBeNull();
  });

  it("rejects a same-key collision for a different operation", async () => {
    const existing: CreditTransactionFixture = { id: "tx-existing", companyId: "company-1", actorUserId: "actor-1", allowanceType: "CONTACT_UNLOCK", amountDelta: -20_000, balanceAfter: 0, referenceType: "LeadContactUnlock", referenceId: "lead-1", idempotencyKey: input.idempotencyKey };
    const { db } = fakeCreditDb({ balance: 0, grantAmount: 0, existing });
    await expect(consumeGenericCompanyCreditsInTransaction(db, input)).rejects.toThrow(/Idempotent key already processed/);
  });
});
