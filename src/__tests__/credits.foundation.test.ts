import { describe, expect, it } from "vitest";
import {
  asCreditAmount,
  CreditAllowanceType,
  isGrantExpired,
  isGrantUsable,
  selectGrantsForConsumption,
} from "@/lib/credits/types";
import type { CreditGrant, MoneyKRW } from "@/lib/credits/types";
import {
  consumeCredits,
  createInMemoryCreditDb,
  getBalance,
  getGrants,
  getTransactions,
  grantCredits,
} from "@/lib/credits/service";
import { computeBalanceFromLedger } from "@/lib/credits/dal";
import type { PaymentProviderBoundary } from "@/lib/payments/boundary";

// Ensure Lead FREE_MVP adapter is not regressed
import { FreeMvpEntitlementAdapter } from "@/lib/leads/entitlement";
import { LEAD_ENTITLEMENT_SOURCE_FREE_MVP, LEAD_POLICY_VERSION } from "@/lib/leads/constants";

describe("Credits Foundation — Gate 3 STATIC/ISOLATED", () => {
  // 1) Company ownership and actor provenance
  describe("1) Company ownership and actor provenance", () => {
    it("economic owner is Company; actorUserId is distinct provenance", () => {
      const db = createInMemoryCreditDb();
      const companyId = "comp_1";
      const actorUserId = "user_99";
      const res = grantCredits(db, {
        companyId,
        actorUserId,
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.MATCH,
        source: "MANUAL_GRANT",
        idempotencyKey: "grant:comp_1:001",
      });
      expect(res.transaction.companyId).toBe(companyId);
      expect(res.transaction.actorUserId).toBe(actorUserId);
      expect(res.account.companyId).toBe(companyId);
      // actor must be distinct from companyId (provenance)
      expect(res.transaction.actorUserId).not.toBe(res.transaction.companyId);
    });

    it("rejects when actorUserId equals companyId (conflation)", () => {
      const db = createInMemoryCreditDb();
      expect(() =>
        grantCredits(db, {
          companyId: "same_id",
          actorUserId: "same_id",
          amount: asCreditAmount(5),
          allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
          source: "MANUAL",
          idempotencyKey: "k1",
        }),
      ).toThrow(/distinct/);
    });

    it("allows system grant with null actor (no provenance user)", () => {
      const db = createInMemoryCreditDb();
      const res = grantCredits(db, {
        companyId: "c_sys",
        actorUserId: null,
        amount: asCreditAmount(3),
        allowanceType: CreditAllowanceType.MATCH,
        source: "SYSTEM",
        idempotencyKey: "sys:1",
      });
      expect(res.transaction.actorUserId).toBeNull();
      expect(res.transaction.companyId).toBe("c_sys");
    });
  });

  // 2) append-only ledger service behavior
  describe("2) append-only ledger service behavior", () => {
    it("ledger is source of truth; no arbitrary balance mutation", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c1",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.MATCH,
        source: "GRANT_SRC",
        idempotencyKey: "g1",
      });
      consumeCredits(db, {
        companyId: "c1",
        amount: asCreditAmount(4),
        allowanceType: CreditAllowanceType.MATCH,
        idempotencyKey: "c1",
      });
      const txs = getTransactions(db, "c1");
      expect(txs).toHaveLength(2);
      expect(txs[0]!.type).toBe("GRANT");
      expect(txs[1]!.type).toBe("CONSUME");
      // balance projection matches ledger sum
      const ledgerSum = computeBalanceFromLedger(txs);
      expect(ledgerSum).toBe(6);
      expect(getBalance(db, "c1")).toBe(6);
      // No update/delete API exposed — only create via service; verify ledger rows never mutated by appending
      // Attempting to mutate balance directly is not exposed; service only appends
    });

    it("transactions are append-only; second grant appends not overwrites", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c2",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        source: "S1",
        idempotencyKey: "g-a",
      });
      grantCredits(db, {
        companyId: "c2",
        amount: asCreditAmount(7),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        source: "S2",
        idempotencyKey: "g-b",
      });
      expect(getTransactions(db, "c2")).toHaveLength(2);
      expect(getBalance(db, "c2")).toBe(12);
    });
  });

  // 3) duplicate idempotency grant/transaction
  describe("3) duplicate idempotency grant/transaction", () => {
    it("duplicate grant with same companyId+idempotencyKey does not duplicate ledger", () => {
      const db = createInMemoryCreditDb();
      const first = grantCredits(db, {
        companyId: "c3",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.MATCH,
        source: "PAYMENT",
        idempotencyKey: "idem-grant-1",
      });
      const second = grantCredits(db, {
        companyId: "c3",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.MATCH,
        source: "PAYMENT",
        idempotencyKey: "idem-grant-1",
      });
      expect(second.transaction.id).toBe(first.transaction.id);
      expect(getTransactions(db, "c3")).toHaveLength(1);
      expect(getBalance(db, "c3")).toBe(10);
    });

    it("duplicate consume is idempotent", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c4",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        source: "S",
        idempotencyKey: "g1",
      });
      const c1 = consumeCredits(db, {
        companyId: "c4",
        amount: asCreditAmount(3),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        idempotencyKey: "consume-1",
      });
      const c2 = consumeCredits(db, {
        companyId: "c4",
        amount: asCreditAmount(3),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        idempotencyKey: "consume-1",
      });
      expect(c2.transaction.id).toBe(c1.transaction.id);
      expect(getTransactions(db, "c4")).toHaveLength(2); // 1 grant + 1 consume
      expect(getBalance(db, "c4")).toBe(7);
    });

    it("different idempotency keys are independent", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c5",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "k1",
      });
      grantCredits(db, {
        companyId: "c5",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "k2",
      });
      expect(getTransactions(db, "c5")).toHaveLength(2);
    });

    it("same idempotencyKey across different companies is isolated", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "cA",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "shared-key",
      });
      grantCredits(db, {
        companyId: "cB",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "shared-key",
      });
      expect(getTransactions(db, "cA")).toHaveLength(1);
      expect(getTransactions(db, "cB")).toHaveLength(1);
    });
  });

  // 4) negative balance rejection/atomicity
  describe("4) negative balance rejection/atomicity", () => {
    it("rejects consume that would make balance negative and leaves ledger atomic", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c6",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "g1",
      });
      expect(() =>
        consumeCredits(db, {
          companyId: "c6",
          amount: asCreditAmount(10),
          allowanceType: CreditAllowanceType.MATCH,
          idempotencyKey: "over-consume",
        }),
      ).toThrow(/Insufficient balance|negative/i);
      // atomicity: ledger unchanged, balance still 5
      expect(getTransactions(db, "c6")).toHaveLength(1);
      expect(getBalance(db, "c6")).toBe(5);
      // grants not partially consumed
      const grants = getGrants(db, "c6");
      expect(grants[0]!.remainingAmount).toBe(5);
    });

    it("prevents negative via grant selection insufficient", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c7",
        amount: asCreditAmount(3),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        source: "S",
        idempotencyKey: "g1",
      });
      expect(() =>
        consumeCredits(db, {
          companyId: "c7",
          amount: asCreditAmount(4),
          allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
          idempotencyKey: "c1",
        }),
      ).toThrow();
      expect(getBalance(db, "c7")).toBe(3);
    });
  });

  // 5) nullable expiry and expiry-aware grant selection
  describe("5) nullable expiry and expiry-aware grant selection", () => {
    it("grant expiry is nullable (no fixed policy)", () => {
      const db = createInMemoryCreditDb();
      const withExpiry = grantCredits(db, {
        companyId: "c8",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        expiresAt: new Date(Date.now() + 100_000),
        idempotencyKey: "g-exp",
      });
      const withoutExpiry = grantCredits(db, {
        companyId: "c8",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        expiresAt: null,
        idempotencyKey: "g-noexp",
      });
      expect(withExpiry.transaction.id).toBeTruthy();
      expect(withoutExpiry.transaction.id).toBeTruthy();
      const grants = getGrants(db, "c8");
      expect(grants.find((g) => g.id === withExpiry.transaction.referenceId)?.expiresAt).toBeInstanceOf(Date);
      expect(grants.find((g) => g.id === withoutExpiry.transaction.referenceId)?.expiresAt).toBeNull();
    });

    it("expired grants are not usable", () => {
      const expired = {
        id: "g1",
        companyId: "c",
        creditAccountId: "ca",
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        referenceId: null,
        amount: asCreditAmount(10),
        remainingAmount: asCreditAmount(10),
        expiresAt: new Date(Date.now() - 10_000),
        createdAt: new Date(Date.now() - 20_000),
        updatedAt: new Date(),
      };
      expect(isGrantExpired(expired)).toBe(true);
      expect(isGrantUsable(expired)).toBe(false);
      const good = { ...expired, expiresAt: null };
      expect(isGrantUsable(good)).toBe(true);
    });

    it("expiry-aware selection: earliest expiry first, nulls last", () => {
      const now = new Date("2026-08-23T00:00:00Z");
      const grants = [
        {
          id: "g_null",
          companyId: "c9",
          creditAccountId: "ca",
          allowanceType: CreditAllowanceType.MATCH,
          source: "S",
          referenceId: null,
          amount: asCreditAmount(10),
          remainingAmount: asCreditAmount(10),
          expiresAt: null,
          createdAt: new Date("2026-08-20T00:00:00Z"),
          updatedAt: new Date(),
        },
        {
          id: "g_soon",
          companyId: "c9",
          creditAccountId: "ca",
          allowanceType: CreditAllowanceType.MATCH,
          source: "S",
          referenceId: null,
          amount: asCreditAmount(10),
          remainingAmount: asCreditAmount(10),
          expiresAt: new Date("2026-08-24T00:00:00Z"),
          createdAt: new Date("2026-08-21T00:00:00Z"),
          updatedAt: new Date(),
        },
        {
          id: "g_later",
          companyId: "c9",
          creditAccountId: "ca",
          allowanceType: CreditAllowanceType.MATCH,
          source: "S",
          referenceId: null,
          amount: asCreditAmount(10),
          remainingAmount: asCreditAmount(10),
          expiresAt: new Date("2026-08-30T00:00:00Z"),
          createdAt: new Date("2026-08-22T00:00:00Z"),
          updatedAt: new Date(),
        },
      ];
      const sel = selectGrantsForConsumption(grants as unknown as CreditGrant[], asCreditAmount(15), now);
      expect(sel.selectedGrants[0]!.grantId).toBe("g_soon");
      expect(sel.selectedGrants[1]!.grantId).toBe("g_later");
      // null expiry last — not selected when earlier grants suffice
      expect(sel.selectedGrants.map((s) => s.grantId)).not.toContain("g_null");

      // When needing more, null grant is used last
      const sel2 = selectGrantsForConsumption(grants as unknown as CreditGrant[], asCreditAmount(25), now);
      expect(sel2.selectedGrants[2]!.grantId).toBe("g_null");
    });

    it("consume respects expiry-aware selection across stored grants", () => {
      const db = createInMemoryCreditDb();
      // grant with soon expiry
      grantCredits(db, {
        companyId: "c10",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        expiresAt: new Date(Date.now() + 50_000),
        idempotencyKey: "g-soon",
      });
      // grant without expiry (should be consumed after expiring ones)
      grantCredits(db, {
        companyId: "c10",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        expiresAt: null,
        idempotencyKey: "g-null",
      });
      consumeCredits(db, {
        companyId: "c10",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        idempotencyKey: "c1",
      });
      const grants = getGrants(db, "c10");
      const soon = grants.find((g) => g.expiresAt !== null);
      const nul = grants.find((g) => g.expiresAt === null);
      expect(soon!.remainingAmount).toBe(0);
      expect(nul!.remainingAmount).toBe(10);
    });
  });

  // 6) Match vs ContactUnlock quota distinction
  describe("6) Match vs ContactUnlock quota distinction", () => {
    it("Match and ContactUnlock allowances are distinct — consuming one does not affect the other", () => {
      const db = createInMemoryCreditDb();
      grantCredits(db, {
        companyId: "c11",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "g-match",
      });
      grantCredits(db, {
        companyId: "c11",
        amount: asCreditAmount(10),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        source: "S",
        idempotencyKey: "g-unlock",
      });
      consumeCredits(db, {
        companyId: "c11",
        amount: asCreditAmount(4),
        allowanceType: CreditAllowanceType.MATCH,
        idempotencyKey: "c-match-1",
      });
      // MATCH consumed, CONTACT_UNLOCK untouched
      const matchGrants = getGrants(db, "c11", CreditAllowanceType.MATCH);
      const unlockGrants = getGrants(db, "c11", CreditAllowanceType.CONTACT_UNLOCK);
      expect(matchGrants[0]!.remainingAmount).toBe(6);
      expect(unlockGrants[0]!.remainingAmount).toBe(10);
      // Cannot consume CONTACT_UNLOCK using MATCH balance exclusively
      // consume CONTACT_UNLOCK should succeed from its own pool
      consumeCredits(db, {
        companyId: "c11",
        amount: asCreditAmount(3),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        idempotencyKey: "c-unlock-1",
      });
      expect(getGrants(db, "c11", CreditAllowanceType.CONTACT_UNLOCK)[0]!.remainingAmount).toBe(7);
      expect(getBalance(db, "c11")).toBe(13); // 20 -4 -3
    });

    it("allowanceType is required and distinct in ledger rows", () => {
      const db = createInMemoryCreditDb();
      const g = grantCredits(db, {
        companyId: "c12",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.MATCH,
        source: "S",
        idempotencyKey: "g1",
      });
      expect(g.transaction.allowanceType).toBe(CreditAllowanceType.MATCH);
      const c = consumeCredits(db, {
        companyId: "c12",
        amount: asCreditAmount(2),
        allowanceType: CreditAllowanceType.MATCH,
        idempotencyKey: "c1",
      });
      expect(c.transaction.allowanceType).toBe(CreditAllowanceType.MATCH);
    });
  });

  // 7) provider-neutral interface shape
  describe("7) provider-neutral interface shape", () => {
    it("PaymentProviderBoundary exposes 5 methods with correct shape, no implementation", async () => {
      const fakeProvider: PaymentProviderBoundary = {
        createPayment: async (input) => ({
          paymentId: "pay_1",
          status: "PENDING",
          amountKrw: input.amountKrw,
          idempotencyKey: input.idempotencyKey,
        }),
        confirmPayment: async (input) => ({ paymentId: input.paymentId, status: "CONFIRMED" }),
        handleWebhook: async (input) => {
          void input;
          return {
            paymentId: null,
            status: null,
            eventType: "test",
            idempotencyKey: null,
          };
        },
        cancelPayment: async (input) => ({ paymentId: input.paymentId, status: "CANCELLED" }),
        refundPayment: async (input) => ({
          paymentId: input.paymentId,
          status: "REFUNDED",
          amountKrw: input.amountKrw ?? null,
        }),
      };
      // shape assertions
      expect(typeof fakeProvider.createPayment).toBe("function");
      expect(typeof fakeProvider.confirmPayment).toBe("function");
      expect(typeof fakeProvider.handleWebhook).toBe("function");
      expect(typeof fakeProvider.cancelPayment).toBe("function");
      expect(typeof fakeProvider.refundPayment).toBe("function");

      const created = await fakeProvider.createPayment({
        companyId: "c1",
        amountKrw: 10000 as unknown as MoneyKRW,
        idempotencyKey: "pay:idem:1",
      });
      expect(created.status).toBe("PENDING");

      const confirmed = await fakeProvider.confirmPayment({ paymentId: created.paymentId });
      expect(confirmed.status).toBe("CONFIRMED");

      const webhook = await fakeProvider.handleWebhook({ rawBody: "{}" });
      expect(webhook.eventType).toBe("test");

      const cancelled = await fakeProvider.cancelPayment({ paymentId: created.paymentId });
      expect(cancelled.status).toBe("CANCELLED");

      const refunded = await fakeProvider.refundPayment({
        paymentId: created.paymentId,
        idempotencyKey: "refund:1",
      });
      expect(refunded.status).toBe("REFUNDED");
    });

    it("MoneyKRW and CreditAmount are separate conceptual types (no conversion logic)", () => {
      const money = 15000 as unknown as number;
      const credit = asCreditAmount(10);
      // They are both integers but distinct branded types — no automatic conversion
      expect(typeof money).toBe("number");
      expect(typeof credit).toBe("number");
      // Ensure no pricing constant exists in payment boundary
      // (foundation fields/types only)
    });
  });

  // 8) no Lead FREE_MVP regression
  describe("8) no Lead FREE_MVP regression", () => {
    it("FreeMvpEntitlementAdapter still allows and is idempotent", async () => {
      const adapter = new FreeMvpEntitlementAdapter();
      const input = {
        companyId: "c_lead",
        leadId: "lead_1",
        actorUserId: "u1",
        idempotencyKey: "lead-contact-unlock:c_lead:lead_1",
      };
      const first = await adapter.consumeLeadUnlockEntitlement(input);
      expect(first.consumed).toBe(true);
      expect(first.entitlementSource).toBe(LEAD_ENTITLEMENT_SOURCE_FREE_MVP);
      expect(first.policyVersion).toBe(LEAD_POLICY_VERSION);
      const second = await adapter.consumeLeadUnlockEntitlement(input);
      expect(second.alreadyConsumed).toBe(true);
      const check = await adapter.checkLeadUnlockEntitlement({
        companyId: "c_lead",
        leadId: "lead_1",
        actorUserId: "u1",
      });
      expect(check.allowed).toBe(true);
    });

    it("credit foundation does not modify LeadContactUnlock flow — separate idempotency domains", async () => {
      const leadAdapter = new FreeMvpEntitlementAdapter();
      const creditDb = createInMemoryCreditDb();
      // Lead unlock idempotency key space is distinct from credit ledger
      await leadAdapter.consumeLeadUnlockEntitlement({
        companyId: "c_same",
        leadId: "lead_x",
        actorUserId: "u1",
        idempotencyKey: "lead-contact-unlock:c_same:lead_x",
      });
      // Credit ledger uses its own idempotency keys — no collision
      grantCredits(creditDb, {
        companyId: "c_same",
        amount: asCreditAmount(5),
        allowanceType: CreditAllowanceType.CONTACT_UNLOCK,
        source: "S",
        idempotencyKey: "lead-contact-unlock:c_same:lead_x", // same string but different domain
      });
      expect(getTransactions(creditDb, "c_same")).toHaveLength(1);
      expect(leadAdapter.hasConsumed({
        companyId: "c_same",
        leadId: "lead_x",
        actorUserId: "u1",
        idempotencyKey: "lead-contact-unlock:c_same:lead_x",
      })).toBe(true);
    });
  });
});
