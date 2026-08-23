import { LEAD_ENTITLEMENT_SOURCE_FREE_MVP, LEAD_POLICY_VERSION } from "./constants";

export type EntitlementCheckResult = {
  allowed: boolean;
  reason?: string;
  remaining?: number;
};

export type EntitlementConsumeResult = {
  consumed: boolean;
  alreadyConsumed: boolean;
  entitlementSource: string;
  policyVersion: string;
};

export type LeadUnlockEntitlementInput = {
  companyId: string;
  leadId: string;
  actorUserId: string;
};

export type LeadUnlockEntitlementConsumeInput = LeadUnlockEntitlementInput & {
  idempotencyKey: string;
};

export interface LeadEntitlementAdapter {
  checkLeadUnlockEntitlement(input: LeadUnlockEntitlementInput): Promise<EntitlementCheckResult>;
  consumeLeadUnlockEntitlement(input: LeadUnlockEntitlementConsumeInput): Promise<EntitlementConsumeResult>;
}

/**
 * FREE_MVP / no-op adapter.
 * advisory check always allows; authoritative consume is deterministic keyed by companyId+leadId and idempotent.
 * No PG/payment/credit ledger/wallet/pricing.
 */
export class FreeMvpEntitlementAdapter implements LeadEntitlementAdapter {
  private consumedKeys = new Set<string>();

  private key(input: LeadUnlockEntitlementConsumeInput): string {
    return input.idempotencyKey;
  }

  async checkLeadUnlockEntitlement(_input: LeadUnlockEntitlementInput): Promise<EntitlementCheckResult> {
    void _input;
    return { allowed: true };
  }

  async consumeLeadUnlockEntitlement(input: LeadUnlockEntitlementConsumeInput): Promise<EntitlementConsumeResult> {
    const k = this.key(input);
    if (this.consumedKeys.has(k)) {
      return {
        consumed: false,
        alreadyConsumed: true,
        entitlementSource: LEAD_ENTITLEMENT_SOURCE_FREE_MVP,
        policyVersion: LEAD_POLICY_VERSION,
      };
    }
    this.consumedKeys.add(k);
    return {
      consumed: true,
      alreadyConsumed: false,
      entitlementSource: LEAD_ENTITLEMENT_SOURCE_FREE_MVP,
      policyVersion: LEAD_POLICY_VERSION,
    };
  }

  // For tests: reset or pre-seed
  clear(): void {
    this.consumedKeys.clear();
  }

  seedConsumed(input: LeadUnlockEntitlementConsumeInput): void {
    this.consumedKeys.add(this.key(input));
  }

  hasConsumed(input: LeadUnlockEntitlementConsumeInput): boolean {
    return this.consumedKeys.has(this.key(input));
  }
}

export const freeMvpEntitlementAdapter = new FreeMvpEntitlementAdapter();

// Factory – Gate2 only exposes FREE_MVP boundary
export function createEntitlementAdapter(kind: "FREE_MVP" = "FREE_MVP"): LeadEntitlementAdapter {
  if (kind === "FREE_MVP") return new FreeMvpEntitlementAdapter();
  throw new Error(`Unknown entitlement adapter: ${kind}`);
}
