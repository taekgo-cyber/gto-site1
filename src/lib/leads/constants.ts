export const LEAD_CONSENT_VERSION = "v1" as const;
export const LEAD_POLICY_VERSION = "v1" as const;
export const LEAD_ENTITLEMENT_SOURCE_FREE_MVP = "FREE_MVP" as const;

export const LEAD_CLOSE_REASONS = ["HIRED", "USER_CLOSED", "ADMIN_CLOSED"] as const;
export const LEAD_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "EXPIRED"] as const;
export const NON_TERMINAL_STATUSES = ["DRAFT", "ACTIVE", "PAUSED"] as const;
export const LEAD_MATCH_STATUSES = ["ACTIVE", "CANCELLED"] as const;

export type LeadPolicy = {
  maxContactUnlocksPerLead: number;
  policyVersion: string;
};

export function resolveLeadPolicy(): LeadPolicy {
  const raw = process.env.LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD;
  if (!raw) throw new Error("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD is not configured");
  const maxContactUnlocksPerLead = Number(raw);
  const policy = { maxContactUnlocksPerLead, policyVersion: LEAD_POLICY_VERSION };
  assertLeadPolicy(policy);
  return policy;
}

export function assertLeadPolicy(policy: LeadPolicy): void {
  if (!Number.isInteger(policy.maxContactUnlocksPerLead) || policy.maxContactUnlocksPerLead < 0) {
    throw new Error("maxContactUnlocksPerLead policy is invalid");
  }
  if (!policy.policyVersion.trim()) {
    throw new Error("policyVersion is required");
  }
}

export function assertUnlockCapacity(currentUnlockCount: number, policy: LeadPolicy): void {
  assertLeadPolicy(policy);
  if (currentUnlockCount >= policy.maxContactUnlocksPerLead) {
    throw new Error("Lead contact unlock cap reached");
  }
}
