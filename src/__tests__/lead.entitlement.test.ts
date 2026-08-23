import { describe, expect, it } from "vitest";
import { FreeMvpEntitlementAdapter } from "@/lib/leads/entitlement";
import {
  assertLeadPolicy,
  assertUnlockCapacity,
  LEAD_ENTITLEMENT_SOURCE_FREE_MVP,
  LEAD_POLICY_VERSION,
} from "@/lib/leads/constants";

describe("entitlement no-op / idempotency", () => {
  const input = (companyId = "c1", leadId = "l1") => ({
    companyId,
    leadId,
    actorUserId: "u1",
    idempotencyKey: `lead-contact-unlock:${companyId}:${leadId}`,
  });

  it("advisory check always allowed", async () => {
    const adapter = new FreeMvpEntitlementAdapter();
    const res = await adapter.checkLeadUnlockEntitlement(input("c1", "l1"));
    expect(res.allowed).toBe(true);
  });

  it("authoritative consume deterministic keyed by companyId+leadId and idempotent", async () => {
    const adapter = new FreeMvpEntitlementAdapter();
    const first = await adapter.consumeLeadUnlockEntitlement(input("c1", "l1"));
    expect(first.consumed).toBe(true);
    expect(first.alreadyConsumed).toBe(false);
    expect(first.entitlementSource).toBe(LEAD_ENTITLEMENT_SOURCE_FREE_MVP);
    expect(first.policyVersion).toBe(LEAD_POLICY_VERSION);

    const second = await adapter.consumeLeadUnlockEntitlement(input("c1", "l1"));
    expect(second.consumed).toBe(false);
    expect(second.alreadyConsumed).toBe(true);
    expect(second.entitlementSource).toBe(LEAD_ENTITLEMENT_SOURCE_FREE_MVP);
  });

  it("different keys are independent", async () => {
    const adapter = new FreeMvpEntitlementAdapter();
    await adapter.consumeLeadUnlockEntitlement(input("c1", "l1"));
    const other = await adapter.consumeLeadUnlockEntitlement(input("c1", "l2"));
    expect(other.consumed).toBe(true);
    const crossCompany = await adapter.consumeLeadUnlockEntitlement(input("c2", "l1"));
    expect(crossCompany.consumed).toBe(true);
  });

  it("duplicate unlock must not consume twice (adapter idempotent)", async () => {
    const adapter = new FreeMvpEntitlementAdapter();
    await adapter.consumeLeadUnlockEntitlement(input("c1", "l1"));
    expect(adapter.hasConsumed(input("c1", "l1"))).toBe(true);
    // second call does not create new consumption
    await adapter.consumeLeadUnlockEntitlement(input("c1", "l1"));
    expect(adapter.hasConsumed(input("c1", "l1"))).toBe(true);
  });

  it("uses deterministic company+lead idempotency even when actor changes", async () => {
    const adapter = new FreeMvpEntitlementAdapter();
    const first = await adapter.consumeLeadUnlockEntitlement(input("c1", "l1"));
    const second = await adapter.consumeLeadUnlockEntitlement({ ...input("c1", "l1"), actorUserId: "u2" });
    expect(first.consumed).toBe(true);
    expect(second.alreadyConsumed).toBe(true);
    expect(second.consumed).toBe(false);
  });

  it("enforces configured maxContactUnlocksPerLead without an unlimited fallback", () => {
    const policy = { maxContactUnlocksPerLead: 2, policyVersion: "v1" };
    expect(() => assertLeadPolicy(policy)).not.toThrow();
    expect(() => assertUnlockCapacity(1, policy)).not.toThrow();
    expect(() => assertUnlockCapacity(2, policy)).toThrow(/cap reached/);
    expect(() => assertLeadPolicy({ maxContactUnlocksPerLead: Number.NaN, policyVersion: "v1" })).toThrow();
  });
});
