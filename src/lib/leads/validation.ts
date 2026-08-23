import {
  LEAD_CONSENT_VERSION,
  LEAD_CLOSE_REASONS,
  LEAD_STATUSES,
} from "./constants";
import type { CandidateLeadInput, CandidateLeadStatus, LeadCloseReason } from "./types";

const PII_FORBIDDEN_KEYS = ["phone", "email", "name", "address", "userId"] as const;
const PHONE_IN_TEXT = /(?:^|\D)01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?:$|\D)/;
const EMAIL_IN_TEXT = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function assertNoPiiInLeadInput(input: Record<string, unknown>): void {
  for (const key of PII_FORBIDDEN_KEYS) {
    if (key in input && input[key] != null && String(input[key]).trim() !== "") {
      throw new Error(`PII field not allowed on Lead: ${key}`);
    }
  }
}

export function assertNoObviousContactInCareerSummary(summary: string | null | undefined): void {
  if (!summary) return;
  if (PHONE_IN_TEXT.test(summary)) throw new Error("careerSummary must not contain a phone number");
  if (EMAIL_IN_TEXT.test(summary)) throw new Error("careerSummary must not contain an email address");
}

export function validateConsentForActivation(input: {
  consentVersion: string | null | undefined;
  consentedAt: Date | string | null | undefined;
}): void {
  if (!input.consentVersion || input.consentVersion.trim() === "") {
    throw new Error("consentVersion required for activation");
  }
  if (input.consentVersion !== LEAD_CONSENT_VERSION) {
    throw new Error(`consentVersion must be ${LEAD_CONSENT_VERSION}`);
  }
  if (!input.consentedAt) {
    throw new Error("consentedAt required for activation");
  }
  const d = new Date(input.consentedAt);
  if (Number.isNaN(d.getTime())) {
    throw new Error("consentedAt invalid date");
  }
  if (d.getTime() > Date.now() + 60_000) {
    throw new Error("consentedAt cannot be in future");
  }
}

export function validateLeadInput(input: CandidateLeadInput): void {
  // no PII
  assertNoPiiInLeadInput(input as unknown as Record<string, unknown>);

  if (input.experienceYears != null) {
    if (!Number.isInteger(input.experienceYears) || input.experienceYears < 0 || input.experienceYears > 60) {
      throw new Error("experienceYears invalid");
    }
  }
  if (input.desiredIncomeMin != null) {
    if (!Number.isInteger(input.desiredIncomeMin) || input.desiredIncomeMin < 0) {
      throw new Error("desiredIncomeMin invalid");
    }
  }
  if (input.desiredIncomeMax != null) {
    if (!Number.isInteger(input.desiredIncomeMax) || input.desiredIncomeMax < 0) {
      throw new Error("desiredIncomeMax invalid");
    }
  }
  if (
    input.desiredIncomeMin != null &&
    input.desiredIncomeMax != null &&
    input.desiredIncomeMin > input.desiredIncomeMax
  ) {
    throw new Error("desiredIncomeMin cannot exceed desiredIncomeMax");
  }
  if (input.availableFrom != null) {
    const d = new Date(input.availableFrom as string);
    if (Number.isNaN(d.getTime())) throw new Error("availableFrom invalid");
  }
  if (input.expiresAt != null) {
    const d = new Date(input.expiresAt as string);
    if (Number.isNaN(d.getTime())) throw new Error("expiresAt invalid");
  }
  if (input.careerSummary != null && input.careerSummary.length > 5000) {
    throw new Error("careerSummary too long");
  }
  if (input.careerSummary != null && input.careerSummary.trim().length === 0) {
    throw new Error("careerSummary cannot be blank");
  }
  assertNoObviousContactInCareerSummary(input.careerSummary);
  if (input.licenseInfo != null && input.licenseInfo.length > 500) {
    throw new Error("licenseInfo too long");
  }
}

export function validateLeadForActivation(input: CandidateLeadInput): void {
  validateLeadInput(input);

  if (!input.preferredRegionId) {
    throw new Error("preferredRegionId required for activation");
  }

  const hasCareerInformation =
    input.experienceYears != null ||
    input.leaseExperience != null ||
    Boolean(input.careerSummary?.trim());
  if (!hasCareerInformation) {
    throw new Error("career information required for activation");
  }

  if (!input.desiredWorkType) {
    throw new Error("desiredWorkType required for activation");
  }
}

export function isValidLeadStatus(s: string): s is CandidateLeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}

export function isValidCloseReason(s: string): s is LeadCloseReason {
  return (LEAD_CLOSE_REASONS as readonly string[]).includes(s);
}

// Lifecycle map: DRAFT → ACTIVE → PAUSED ↔ ACTIVE → CLOSED / EXPIRED ; terminal
const ALLOWED_TRANSITIONS: Record<CandidateLeadStatus, CandidateLeadStatus[]> = {
  DRAFT: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "CLOSED", "EXPIRED"],
  PAUSED: ["ACTIVE", "CLOSED", "EXPIRED"],
  CLOSED: [],
  EXPIRED: [],
};

export function canTransitionLeadStatus(from: CandidateLeadStatus, to: CandidateLeadStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(s: CandidateLeadStatus): boolean {
  return s === "CLOSED" || s === "EXPIRED";
}

export function isNonTerminalStatus(s: CandidateLeadStatus): boolean {
  return s === "DRAFT" || s === "ACTIVE" || s === "PAUSED";
}

export function isEffectiveActiveLead(lead: {
  status: CandidateLeadStatus;
  expiresAt: Date | null;
  consentVersion: string | null;
  consentedAt: Date | null;
}): boolean {
  if (lead.status !== "ACTIVE" && lead.status !== "PAUSED") return false;
  // Actually PAUSED is not discoverable; only ACTIVE is effective for discovery/match/unlock.
  // Spec says expiresAt <= now is effectively inactive for discovery/match/unlock
  if (lead.status !== "ACTIVE") return false;
  if (lead.expiresAt && lead.expiresAt.getTime() <= Date.now()) return false;
  if (lead.consentVersion !== LEAD_CONSENT_VERSION) return false;
  if (!lead.consentedAt || Number.isNaN(lead.consentedAt.getTime())) return false;
  return true;
}

// For discovery/match/unlock, only ACTIVE + not expired + consent is effective. PAUSED is inactive.
export function isInactiveByExpiry(expiresAt: Date | null, now = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}
