import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  candidateLead: { findMany: vi.fn(), findUnique: vi.fn() },
  leadMatch: { findMany: vi.fn(), findUnique: vi.fn() },
  leadContactUnlock: { findMany: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  companyMember: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { listCandidateOperations, getCandidateOperationDetail, listCompanyOperations } from "@/lib/leads/operations";
import { parseCompanyOperationsQuery, parseCandidateOperationsQuery } from "@/lib/leads/operations-validation";
import { resolveActiveCompanyId } from "@/lib/company/context";

beforeEach(() => vi.clearAllMocks());

// ------------------------------------------------------------
// Candidate operations
// ------------------------------------------------------------
describe("Gate3 candidate operations isolation and DTO", () => {
  it("candidate own history PASS — returns company name/status/time/unlock flag/time and current lead status", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([
      { id: "lead1", status: "ACTIVE" },
      { id: "lead2", status: "PAUSED" },
    ]);
    prismaMock.leadMatch.findMany.mockResolvedValue([
      {
        leadId: "lead1",
        companyId: "c1",
        status: "ACTIVE",
        createdAt: new Date("2026-08-20T10:00:00Z"),
        updatedAt: new Date("2026-08-20T10:00:00Z"),
        company: { id: "c1", name: "주식회사 A" },
      },
      {
        leadId: "lead2",
        companyId: "c2",
        status: "CANCELLED",
        createdAt: new Date("2026-08-21T11:00:00Z"),
        updatedAt: new Date("2026-08-21T12:00:00Z"),
        company: { id: "c2", name: "주식회사 B" },
      },
    ]);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([
      { companyId: "c1", leadId: "lead1", unlockedAt: new Date("2026-08-20T11:00:00Z") },
    ]);

    const res = await listCandidateOperations({ actorUserId: "candidate1" });
    expect(res.totalCount).toBe(2);
    const first = res.items.find((i) => i.leadId === "lead1")!;
    expect(first.companyName).toBe("주식회사 A");
    expect(first.matchStatus).toBe("ACTIVE");
    expect(first.matchCreatedAt).toEqual(new Date("2026-08-20T10:00:00Z"));
    expect(first.hasUnlock).toBe(true);
    expect(first.unlockedAt).toEqual(new Date("2026-08-20T11:00:00Z"));
    expect(first.leadStatus).toBe("ACTIVE");
    const second = res.items.find((i) => i.leadId === "lead2")!;
    expect(second.matchStatus).toBe("CANCELLED");
    expect(second.hasUnlock).toBe(false);
    expect(second.unlockedAt).toBeNull();
    expect(second.leadStatus).toBe("PAUSED");
  });

  it("candidate isolation: other user DENY via getCandidateOperationDetail when lead userId mismatch", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue({ id: "lead1", userId: "ownerOther", status: "ACTIVE" });
    await expect(getCandidateOperationDetail({ actorUserId: "attacker", leadId: "lead1" })).rejects.toThrow(/Forbidden/);
    // ensure no match query executed after isolation check
    expect(prismaMock.leadMatch.findMany).not.toHaveBeenCalled();
  });

  it("candidate own detail PASS", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue({ id: "lead1", userId: "candidate1", status: "ACTIVE" });
    prismaMock.leadMatch.findMany.mockResolvedValue([
      { leadId: "lead1", companyId: "c1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), company: { id: "c1", name: "A" } },
    ]);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    const res = await getCandidateOperationDetail({ actorUserId: "candidate1", leadId: "lead1" });
    expect(res).not.toBeNull();
    expect(res![0].companyName).toBe("A");
  });

  it("candidate operations DTO never exposes actor name, internal userId, company phone/email, entitlement internals", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", status: "ACTIVE" }]);
    prismaMock.leadMatch.findMany.mockResolvedValue([
      {
        leadId: "lead1",
        companyId: "c1",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        company: { id: "c1", name: "주식회사 A", phone: "02-1234-5678", email: "rep@a.com" } as never,
        actorUserId: "internal-actor",
        entitlementSource: "FREE_MVP",
        policyVersion: "v1",
      } as never,
    ]);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([
      { companyId: "c1", leadId: "lead1", unlockedAt: new Date(), entitlementSource: "FREE_MVP", policyVersion: "v1" } as never,
    ]);
    const res = await listCandidateOperations({ actorUserId: "candidate1" });
    const keys = Object.keys(res.items[0] as unknown as Record<string, unknown>);
    expect(keys).not.toContain("actorUserId");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("entitlementSource");
    expect(keys).not.toContain("policyVersion");
    expect((res.items[0] as unknown as Record<string, unknown>).companyName).toBe("주식회사 A");
    // Ensure DTO stringify doesn't leak phone
    expect(JSON.stringify(res)).not.toContain("02-1234");
    expect(JSON.stringify(res)).not.toContain("rep@a.com");
  });

  it("history retained even when CandidateLead is PAUSED/CLOSED/EXPIRED", async () => {
    for (const status of ["PAUSED", "CLOSED", "EXPIRED"] as const) {
      prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", status }]);
      prismaMock.leadMatch.findMany.mockResolvedValue([
        { leadId: "lead1", companyId: "c1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), company: { id: "c1", name: "A" } },
      ]);
      prismaMock.leadContactUnlock.findMany.mockResolvedValue([
        { companyId: "c1", leadId: "lead1", unlockedAt: new Date() },
      ]);
      const res = await listCandidateOperations({ actorUserId: "u1" });
      expect(res.items.length).toBe(1);
      expect(res.items[0].leadStatus).toBe(status);
      expect(res.items[0].hasUnlock).toBe(true);
    }
  });

  it("candidate per-company approve/reject workflow not present", async () => {
    // Ensure operations module does not export approve/reject for candidate
    const opsExports = await import("@/lib/leads/operations");
    expect((opsExports as unknown as Record<string, unknown>).approveCandidateMatch).toBeUndefined();
    expect((opsExports as unknown as Record<string, unknown>).rejectCandidateMatch).toBeUndefined();
  });
});

// ------------------------------------------------------------
// Company operations: authorization, filters, pagination, privacy
// ------------------------------------------------------------
describe("Gate3 company operations bounded list", () => {
  function mockActiveCompanyActor(overrides: { role?: string; userStatus?: string; companyStatus?: string; memberStatus?: string } = {}) {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: overrides.userStatus ?? "ACTIVE", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: overrides.companyStatus ?? "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: overrides.role ?? "OWNER", status: overrides.memberStatus ?? "ACTIVE" } as never);
  }

  function mockLeadMatchRows() {
    const baseLead = (id: string, status: string) => ({
      id,
      userId: "candidateX",
      status,
      preferredRegionId: null,
      vehicleTypeId: null,
      tonnageId: null,
      experienceYears: 3,
      leaseExperience: true,
      vehicleOwned: false,
      licenseInfo: null,
      desiredWorkType: "FULL_TIME",
      desiredIncomeMin: 300,
      desiredIncomeMax: 400,
      availableFrom: null,
      careerSummary: "career",
      consentVersion: "v1",
      consentedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
      pausedAt: null,
      closedAt: null,
      closeReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredRegion: null,
      vehicleType: null,
      tonnage: null,
    });
    return [
      {
        leadId: "lead1",
        companyId: "c1",
        status: "ACTIVE",
        createdAt: new Date("2026-08-20T10:00:00Z"),
        updatedAt: new Date("2026-08-20T10:00:00Z"),
        lead: baseLead("lead1", "ACTIVE"),
      },
      {
        leadId: "lead2",
        companyId: "c1",
        status: "CANCELLED",
        createdAt: new Date("2026-08-21T10:00:00Z"),
        updatedAt: new Date("2026-08-21T11:00:00Z"),
        lead: baseLead("lead2", "PAUSED"),
      },
      {
        leadId: "lead3",
        companyId: "c1",
        status: "ACTIVE",
        createdAt: new Date("2026-08-22T10:00:00Z"),
        updatedAt: new Date("2026-08-22T10:00:00Z"),
        lead: baseLead("lead3", "CLOSED"),
      },
    ] as never;
  }

  it("OWNER and MANAGER allowed; STAFF denied for company operations (discovery only)", async () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      mockActiveCompanyActor({ role });
      prismaMock.leadMatch.findMany.mockResolvedValue([]);
      prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
      const res = await listCompanyOperations({ actorUserId: "u1", companyId: "c1" });
      expect(res.totalCount).toBe(0);
    }
    mockActiveCompanyActor({ role: "STAFF" });
    prismaMock.leadMatch.findMany.mockResolvedValue([]);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    await expect(listCompanyOperations({ actorUserId: "u1", companyId: "c1" })).rejects.toThrow(/Forbidden: company operations not allowed/);
  });

  it("other Company DENY — non-member isolated", async () => {
    // User has no membership for c2
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c2", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue(null);
    await expect(listCompanyOperations({ actorUserId: "u1", companyId: "c2" })).rejects.toThrow();
  });

  it("selected company tampering DENY via resolveActiveCompanyId and recheck", async () => {
    const memberships = [
      { companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
      { companyId: "c2", companyName: "B", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
    ] as never;
    expect(() => resolveActiveCompanyId({ memberships, selectedCompanyId: "c3" })).toThrow(/MISMATCH/);
    // multi-membership no silent fallback
    const res = resolveActiveCompanyId({ memberships, selectedCompanyId: null });
    expect(res).toEqual({ companyId: null, requireSelection: true });
  });

  it("multi-membership no silent fallback — single auto-select vs multi require explicit", async () => {
    const one = [{ companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" } as never];
    expect(resolveActiveCompanyId({ memberships: one, selectedCompanyId: null })).toEqual({ companyId: "c1", autoSelected: true });
    const two = [
      { companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
      { companyId: "c2", companyName: "B", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
    ] as never;
    expect(resolveActiveCompanyId({ memberships: two, selectedCompanyId: null })).toEqual({ companyId: null, requireSelection: true });
  });

  it("pre-unlock privacy: operations DTO does not serialize candidate name/phone/email/userId", async () => {
    mockActiveCompanyActor({ role: "OWNER" });
    prismaMock.leadMatch.findMany.mockResolvedValue(mockLeadMatchRows());
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    const res = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", filter: "ALL" });
    for (const item of res.items) {
      const dtoKeys = Object.keys(item.candidateSummary);
      expect(dtoKeys).not.toContain("userId");
      expect(dtoKeys).not.toContain("name");
      expect(dtoKeys).not.toContain("phone");
      expect(dtoKeys).not.toContain("email");
      expect((item.candidateSummary as unknown as Record<string, unknown>).phone).toBeUndefined();
      expect((item as unknown as Record<string, unknown>).phone).toBeUndefined();
      expect((item as unknown as Record<string, unknown>).name).toBeUndefined();
    }
    expect(JSON.stringify(res)).not.toContain("010-");
  });

  it("unlocked flag does not serialize phone even when unlock exists", async () => {
    mockActiveCompanyActor({ role: "OWNER" });
    prismaMock.leadMatch.findMany.mockResolvedValue(mockLeadMatchRows());
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([
      { leadId: "lead1", unlockedAt: new Date("2026-08-20T11:00:00Z") },
      { leadId: "lead3", unlockedAt: new Date("2026-08-22T11:00:00Z") },
    ] as never);
    const res = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", filter: "ALL" });
    const withUnlock = res.items.filter((i) => i.hasUnlock);
    expect(withUnlock.length).toBe(2);
    for (const item of withUnlock) {
      expect(item.hasUnlock).toBe(true);
      expect(item.unlockedAt).toBeInstanceOf(Date);
      expect((item as unknown as Record<string, unknown>).phone).toBeUndefined();
      expect((item.candidateSummary as unknown as Record<string, unknown>).phone).toBeUndefined();
    }
  });

  it("ACTIVE / CANCELLED / UNLOCKED filters — UNLOCKED derived from LeadContactUnlock existence", async () => {
    mockActiveCompanyActor({ role: "OWNER" });
    prismaMock.leadMatch.findMany.mockResolvedValue(mockLeadMatchRows());
    // Only lead1 and lead3 have unlocks
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([
      { leadId: "lead1", unlockedAt: new Date() },
      { leadId: "lead3", unlockedAt: new Date() },
    ] as never);

    // UNLOCKED derivation: should only include lead1 and lead3
    const unlocked = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", filter: "UNLOCKED" });
    expect(unlocked.items.every((i) => i.hasUnlock)).toBe(true);
    expect(unlocked.totalCount).toBe(2);
    expect(unlocked.items.map((i) => i.leadId).sort()).toEqual(["lead1", "lead3"]);
  });

  it("PAUSED/CLOSED/EXPIRED history retention — lead status does not hide match", async () => {
    mockActiveCompanyActor({ role: "OWNER" });
    prismaMock.leadMatch.findMany.mockResolvedValue(mockLeadMatchRows() as never);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    const res = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", filter: "ALL" });
    expect(res.items.map((i) => i.leadStatus).sort()).toEqual(["ACTIVE", "CLOSED", "PAUSED"]);
  });

  it("pagination and malformed bounds — normalize and cap", async () => {
    const q1 = parseCompanyOperationsQuery(new URLSearchParams("page=0&pageSize=9999&filter=INVALID"));
    expect(q1.page).toBe(1);
    expect(q1.pageSize).toBe(50);
    expect(q1.filter).toBe("ALL");
    const q2 = parseCompanyOperationsQuery(new URLSearchParams("page=abc&pageSize=-5&filter=active"));
    expect(q2.page).toBe(1);
    expect(q2.pageSize).toBe(20); // default when invalid? our parser falls back to 20 if not integer >=1
    expect(q2.filter).toBe("ACTIVE");
    const q3 = parseCompanyOperationsQuery(new URLSearchParams("page=2&pageSize=5&filter=UNLOCKED"));
    expect(q3.page).toBe(2);
    expect(q3.pageSize).toBe(5);
    expect(q3.filter).toBe("UNLOCKED");

    // Server-bounded pagination slicing
    mockActiveCompanyActor({ role: "OWNER" });
    const many = Array.from({ length: 12 }, (_, i) => ({
      leadId: `lead${i}`,
      companyId: "c1",
      status: "ACTIVE",
      createdAt: new Date(2026, 7, 20, 10, i),
      updatedAt: new Date(2026, 7, 20, 10, i),
      lead: {
        id: `lead${i}`,
        userId: "candidateX",
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
        careerSummary: null,
        consentVersion: null,
        consentedAt: null,
        expiresAt: null,
        pausedAt: null,
        closedAt: null,
        closeReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        preferredRegion: null,
        vehicleType: null,
        tonnage: null,
      },
    } as never));
    prismaMock.leadMatch.findMany.mockResolvedValue(many);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    const page1 = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", page: 1, pageSize: 5 });
    expect(page1.items.length).toBe(5);
    expect(page1.totalPages).toBe(3);
    const page3 = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", page: 3, pageSize: 5 });
    expect(page3.items.length).toBe(2);
    // Huge pageSize capped at 50 already in service
    const huge = await listCompanyOperations({ actorUserId: "u1", companyId: "c1", page: 1, pageSize: 999 });
    expect(huge.pageSize).toBe(50);
  });

  it("terminated Lead PII refetch DENY — toUnlockedDto requires effective ACTIVE", async () => {
    const { toUnlockedDto } = await import("@/lib/leads/dto");
    const lead = {
      id: "lead1",
      userId: "candidate1",
      status: "PAUSED",
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
      careerSummary: null,
      consentVersion: "v1",
      consentedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
      pausedAt: new Date(),
      closedAt: null,
      closeReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredRegion: null,
      vehicleType: null,
      tonnage: null,
    } as never;
    const dto = toUnlockedDto({ lead, user: { name: "홍길동", phone: "010-1234-5678" }, entitlementSource: "FREE_MVP", policyVersion: "v1" }) as { contact: unknown };
    expect(dto.contact).toBeNull();
  });

  it("candidate operations pagination helper normalizes malformed", () => {
    const q = parseCandidateOperationsQuery(new URLSearchParams("page=0&pageSize=9999"));
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(50);
    const q2 = parseCandidateOperationsQuery(new URLSearchParams("page=abc&pageSize=-5"));
    expect(q2.page).toBe(1);
    expect(q2.pageSize).toBe(20);
    const q3 = parseCandidateOperationsQuery(new URLSearchParams("page=2&pageSize=5"));
    expect(q3.page).toBe(2);
    expect(q3.pageSize).toBe(5);
  });

  it("candidate bounded pagination slicing and metadata", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", status: "ACTIVE" }]);
    const many = Array.from({ length: 12 }, (_, i) => ({
      leadId: "lead1",
      companyId: `c${i}`,
      status: "ACTIVE",
      createdAt: new Date(2026, 7, 20, 10, i),
      updatedAt: new Date(2026, 7, 20, 10, i),
      company: { id: `c${i}`, name: `회사 ${i}` },
    } as never));
    prismaMock.leadMatch.findMany.mockResolvedValue(many);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);

    const page1 = await listCandidateOperations({ actorUserId: "u1", page: 1, pageSize: 5 });
    expect(page1.items.length).toBe(5);
    expect(page1.totalCount).toBe(12);
    expect(page1.totalPages).toBe(3);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(5);

    const page3 = await listCandidateOperations({ actorUserId: "u1", page: 3, pageSize: 5 });
    expect(page3.items.length).toBe(2);
    expect(page3.page).toBe(3);

    // huge pageSize capped at 50
    const huge = await listCandidateOperations({ actorUserId: "u1", page: 1, pageSize: 999 });
    expect(huge.pageSize).toBe(50);
    expect(huge.totalPages).toBe(1);
  });

  it("candidate pagination normalizes invalid page/pageSize values", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", status: "ACTIVE" }]);
    prismaMock.leadMatch.findMany.mockResolvedValue([
      { leadId: "lead1", companyId: "c1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), company: { id: "c1", name: "A" } },
      { leadId: "lead1", companyId: "c2", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), company: { id: "c2", name: "B" } },
    ] as never);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);

    const invalid = await listCandidateOperations({ actorUserId: "u1", page: 0, pageSize: 9999 });
    expect(invalid.page).toBe(1);
    expect(invalid.pageSize).toBe(50);
    expect(invalid.totalCount).toBe(2);

    const nan = await listCandidateOperations({ actorUserId: "u1", page: NaN as unknown as number, pageSize: NaN as unknown as number });
    expect(nan.page).toBe(1);
    expect(nan.pageSize).toBe(20);
  });

  it("candidate empty history returns bounded pagination metadata", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([]);
    const res = await listCandidateOperations({ actorUserId: "u1", page: 2, pageSize: 10 });
    expect(res.items.length).toBe(0);
    expect(res.totalCount).toBe(0);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(10);
    expect(res.totalPages).toBe(1);
  });
});
