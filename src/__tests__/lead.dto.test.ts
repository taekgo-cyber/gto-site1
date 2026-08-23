import { describe, expect, it } from "vitest";
import { toPreUnlockDto, toUnlockedDto } from "@/lib/leads/dto";
import type { CandidateLeadRecord } from "@/lib/leads/types";

function makeLead(overrides: Partial<CandidateLeadRecord> = {}): CandidateLeadRecord & {
  preferredRegion: { id: string; name: string } | null;
  vehicleType: { id: string; name: string } | null;
  tonnage: { id: string; name: string } | null;
} {
  return {
    id: "lead1",
    userId: "user1",
    status: "ACTIVE",
    preferredRegionId: "r1",
    vehicleTypeId: "v1",
    tonnageId: "t1",
    experienceYears: 3,
    leaseExperience: true,
    vehicleOwned: false,
    licenseInfo: "1종 대형",
    desiredWorkType: "FULL_TIME",
    desiredIncomeMin: 300,
    desiredIncomeMax: 500,
    availableFrom: new Date("2026-08-20"),
    careerSummary: "career",
    consentVersion: "v1",
    consentedAt: new Date("2026-08-19"),
    expiresAt: new Date(Date.now() + 3600_000),
    pausedAt: null,
    closedAt: null,
    closeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    preferredRegion: { id: "r1", name: "서울" },
    vehicleType: { id: "v1", name: "카고" },
    tonnage: { id: "t1", name: "5톤" },
    ...overrides,
  };
}

describe("DTO privacy boundary", () => {
  it("pre-unlock DTO excludes userId, name, phone, email, exact address and internal audit identifiers", () => {
    const dto = toPreUnlockDto(makeLead() as never);
    // Ensure no PII keys
    const keys = Object.keys(dto);
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("name");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("address");
    // Should contain allowed fields
    expect(dto.experienceYears).toBe(3);
    expect(dto.preferredRegion?.name).toBe("서울");
    // Must not leak closeReason/internal audit beyond status
    expect((dto as unknown as Record<string, unknown>).closeReason).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).consentVersion).toBeUndefined();
  });

  it("unlocked DTO returns contact when ACTIVE and not expired", () => {
    const lead = makeLead();
    const dto = toUnlockedDto({
      lead: lead as never,
      user: { name: "홍길동", phone: "010-1234-5678" },
      entitlementSource: "FREE_MVP",
      policyVersion: "v1",
    }) as { contact: { name: string; phone: string | null } | null };
    expect(dto.contact).toEqual({ name: "홍길동", phone: "010-1234-5678" });
  });

  it("unlocked DTO returns no contact when paused/closed/expired", () => {
    for (const status of ["PAUSED", "CLOSED", "EXPIRED"] as const) {
      const lead = makeLead({ status });
      const dto = toUnlockedDto({
        lead: lead as never,
        user: { name: "홍길동", phone: "010-1234-5678" },
        entitlementSource: "FREE_MVP",
        policyVersion: "v1",
      }) as { contact: unknown };
      expect(dto.contact).toBeNull();
    }
  });

  it("unlocked DTO returns no contact when expired by time", () => {
    const lead = makeLead({ expiresAt: new Date(Date.now() - 1000) });
    const dto = toUnlockedDto({
      lead: lead as never,
      user: { name: "홍길동", phone: "010-1234-5678" },
      entitlementSource: "FREE_MVP",
      policyVersion: "v1",
    }) as { contact: unknown };
    expect(dto.contact).toBeNull();
  });

  it("does not reuse JobPost/LeasePost phone paths", () => {
    const dto = toPreUnlockDto(makeLead() as never) as unknown as Record<string, unknown>;
    expect(dto.companyPhone).toBeUndefined();
    expect(dto.authorName).toBeUndefined();
  });
});
