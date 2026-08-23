import { describe, expect, it } from "vitest";
import {
  canTransitionLeadStatus,
  isTerminalStatus,
  isNonTerminalStatus,
  validateLeadInput,
  validateConsentForActivation,
  assertNoPiiInLeadInput,
} from "@/lib/leads/validation";
import { LEAD_CONSENT_VERSION } from "@/lib/leads/constants";

describe("lead lifecycle", () => {
  it("DRAFT→ACTIVE allowed, requires consent", () => {
    expect(canTransitionLeadStatus("DRAFT", "ACTIVE")).toBe(true);
    expect(() => validateConsentForActivation({ consentVersion: LEAD_CONSENT_VERSION, consentedAt: new Date() })).not.toThrow();
    expect(() => validateConsentForActivation({ consentVersion: "", consentedAt: new Date() })).toThrow();
  });

  it("ACTIVE↔PAUSED transitions", () => {
    expect(canTransitionLeadStatus("ACTIVE", "PAUSED")).toBe(true);
    expect(canTransitionLeadStatus("PAUSED", "ACTIVE")).toBe(true);
    expect(canTransitionLeadStatus("ACTIVE", "DRAFT")).toBe(false);
  });

  it("ACTIVE/PAUSED → CLOSED and EXPIRED", () => {
    expect(canTransitionLeadStatus("ACTIVE", "CLOSED")).toBe(true);
    expect(canTransitionLeadStatus("PAUSED", "CLOSED")).toBe(true);
    expect(canTransitionLeadStatus("ACTIVE", "EXPIRED")).toBe(true);
    expect(canTransitionLeadStatus("PAUSED", "EXPIRED")).toBe(true);
  });

  it("CLOSED/EXPIRED terminal", () => {
    expect(canTransitionLeadStatus("CLOSED", "ACTIVE")).toBe(false);
    expect(canTransitionLeadStatus("EXPIRED", "PAUSED")).toBe(false);
    expect(isTerminalStatus("CLOSED")).toBe(true);
    expect(isTerminalStatus("EXPIRED")).toBe(true);
    expect(isNonTerminalStatus("DRAFT")).toBe(true);
    expect(isNonTerminalStatus("ACTIVE")).toBe(true);
    expect(isNonTerminalStatus("PAUSED")).toBe(true);
    expect(isNonTerminalStatus("CLOSED")).toBe(false);
  });

  it("rejects PII on lead input", () => {
    expect(() => assertNoPiiInLeadInput({ phone: "010-1234" } as never)).toThrow(/PII/);
    expect(() => assertNoPiiInLeadInput({ email: "a@b.com" } as never)).toThrow();
    expect(() => validateLeadInput({ consentVersion: LEAD_CONSENT_VERSION, consentedAt: new Date(), careerSummary: "ok" } as never)).not.toThrow();
  });

  it("validateLeadInput income range and expiry", () => {
    expect(() =>
      validateLeadInput({
        consentVersion: LEAD_CONSENT_VERSION,
        consentedAt: new Date(),
        desiredIncomeMin: 500,
        desiredIncomeMax: 300,
      } as never),
    ).toThrow(/cannot exceed/);
    expect(() =>
      validateLeadInput({
        consentVersion: LEAD_CONSENT_VERSION,
        consentedAt: new Date(),
        expiresAt: "invalid-date" as never,
      } as never),
    ).toThrow(/expiresAt invalid/);
  });

  it("consent future date rejected", () => {
    const future = new Date(Date.now() + 120_000);
    expect(() => validateConsentForActivation({ consentVersion: LEAD_CONSENT_VERSION, consentedAt: future })).toThrow(/future/);
  });
});
