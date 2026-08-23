import { describe, expect, it, vi } from "vitest";
import { resolveLeadPolicy } from "@/lib/leads/constants";
import { parseLeadDiscoveryQuery } from "@/lib/leads/discovery-validation";
import { assertNoObviousContactInCareerSummary } from "@/lib/leads/validation";
import { toPreUnlockDto } from "@/lib/leads/dto";

describe("lead privacy, abuse, and fail-closed QA", () => {
  it("rejects obvious phone/email free-text PII without an AI detector", () => {
    expect(() => assertNoObviousContactInCareerSummary("경력 문의 010-1234-5678")).toThrow(/phone/);
    expect(() => assertNoObviousContactInCareerSummary("메일 candidate@example.com")).toThrow(/email/);
    expect(() => assertNoObviousContactInCareerSummary("10년 운송 경력, 주간 근무 희망")).not.toThrow();
  });

  it("bounds pagination and drops malformed filter values", () => {
    const query = parseLeadDiscoveryQuery(new URLSearchParams("companyId=c1&page=0&pageSize=999999&minExperienceYears=-4&availableFromBefore=nope"));
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(50);
    expect(query.filters.minExperienceYears).toBeUndefined();
    expect(query.filters.availableFromBefore).toBeUndefined();
  });

  it("fails closed for missing, invalid, zero, and negative unlock policy", () => {
    vi.stubEnv("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD", "");
    expect(() => resolveLeadPolicy()).toThrow();
    vi.stubEnv("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD", "not-a-number");
    expect(() => resolveLeadPolicy()).toThrow();
    vi.stubEnv("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD", "0");
    expect(() => resolveLeadPolicy()).not.toThrow();
    vi.stubEnv("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD", "-1");
    expect(() => resolveLeadPolicy()).toThrow();
    vi.stubEnv("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD", "2");
    expect(resolveLeadPolicy()).toEqual({ maxContactUnlocksPerLead: 2, policyVersion: "v1" });
    vi.unstubAllEnvs();
  });

  it("keeps pre-unlock DTO free of raw User and internal metadata", () => {
    const dto = toPreUnlockDto({
      id: "lead-1",
      userId: "candidate-1",
      status: "ACTIVE",
      preferredRegionId: null,
      vehicleTypeId: null,
      tonnageId: null,
      experienceYears: null,
      leaseExperience: null,
      vehicleOwned: null,
      licenseInfo: null,
      desiredWorkType: null,
      desiredIncomeMin: null,
      desiredIncomeMax: null,
      availableFrom: null,
      careerSummary: "경력",
      consentVersion: "v1",
      consentedAt: new Date(),
      expiresAt: null,
      pausedAt: null,
      closedAt: null,
      closeReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredRegion: null,
      vehicleType: null,
      tonnage: null,
    });
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("name");
    expect(dto).not.toHaveProperty("phone");
    expect(dto).not.toHaveProperty("email");
    expect(dto).not.toHaveProperty("consentVersion");
    expect(dto).not.toHaveProperty("closeReason");
  });
});
