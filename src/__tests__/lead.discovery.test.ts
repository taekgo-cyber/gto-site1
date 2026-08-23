import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLeadMatch } from "@/lib/leads/service";
import { discoverCandidateLeads } from "@/lib/leads/discovery";
import { findDiscoverableLeads } from "@/lib/leads/dal";
import { parseLeadDiscoveryQuery } from "@/lib/leads/discovery-validation";

const prismaMock = vi.hoisted(() => ({
  candidateLead: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  companyMember: { findUnique: vi.fn() },
  leadMatch: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  companyRecruitmentEntitlement: { findMany: vi.fn() },
  companyQuotaUsage: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  companyQuotaConsumption: { findUnique: vi.fn(), create: vi.fn() },
  creditAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  creditGrant: { findMany: vi.fn(), updateMany: vi.fn() },
  creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

function activeLead(id = "lead-1") {
  return {
    id,
    userId: "candidate-1",
    status: "ACTIVE",
    preferredRegionId: "region-1",
    vehicleTypeId: "vehicle-1",
    tonnageId: "tonnage-1",
    experienceYears: 5,
    leaseExperience: true,
    vehicleOwned: false,
    licenseInfo: "1종 대형",
    desiredWorkType: "FULL_TIME",
    desiredIncomeMin: null,
    desiredIncomeMax: null,
    availableFrom: null,
    careerSummary: "운송 경력",
    expiresAt: null,
    consentVersion: "v1",
    consentedAt: new Date(),
    pausedAt: null,
    closedAt: null,
    closeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    preferredRegion: { id: "region-1", name: "서울" },
    vehicleType: { id: "vehicle-1", name: "카고" },
    tonnage: { id: "tonnage-1", name: "5톤" },
  };
}

function companyActor(role = "OWNER") {
  prismaMock.user.findUnique.mockResolvedValue({ id: "company-user", status: "ACTIVE", role: "COMPANY" });
  prismaMock.company.findUnique.mockResolvedValue({ id: "company-1", status: "ACTIVE" });
  prismaMock.companyMember.findUnique.mockResolvedValue({ role, status: "ACTIVE" });
}

describe("company discovery and matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.companyRecruitmentEntitlement.findMany.mockResolvedValue([]);
    prismaMock.companyQuotaConsumption.findUnique.mockResolvedValue(null);
    prismaMock.companyQuotaUsage.findUnique.mockResolvedValue(null);
    prismaMock.companyQuotaUsage.upsert.mockResolvedValue({ id: "quota-1", companyId: "company-1", allowanceType: "MATCH", windowStart: new Date(), windowEnd: new Date(), consumedCount: 0 });
    prismaMock.companyQuotaUsage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.companyQuotaConsumption.create.mockResolvedValue({ id: "quota-consumption-1" });
    prismaMock.creditAccount.findUnique.mockResolvedValue(null);
    prismaMock.creditAccount.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.creditGrant.findMany.mockResolvedValue([]);
    prismaMock.creditGrant.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.creditTransaction.findUnique.mockResolvedValue(null);
    prismaMock.creditTransaction.create.mockResolvedValue({ id: "credit-transaction-1" });
  });

  it("uses effective ACTIVE/no-expiry query with minimum filters and pagination", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([]);
    await findDiscoverableLeads({ preferredRegionId: "region-1", minExperienceYears: 3, take: 10, skip: 10 });
    expect(prismaMock.candidateLead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        preferredRegionId: "region-1",
        experienceYears: { gte: 3 },
      }),
      take: 10,
      skip: 10,
    }));
  });

  it("returns pre-unlock DTOs without PII for all discovery roles", async () => {
    companyActor("STAFF");
    prismaMock.candidateLead.findMany.mockResolvedValue([activeLead()]);
    prismaMock.candidateLead.count.mockResolvedValue(1);

    const result = await discoverCandidateLeads({ actorUserId: "company-user", companyId: "company-1" });
    const dto = result.items[0] as unknown as Record<string, unknown>;
    expect(dto.id).toBe("lead-1");
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("name");
    expect(dto).not.toHaveProperty("phone");
    expect(dto).not.toHaveProperty("email");
    expect(dto).not.toHaveProperty("consentVersion");
  });

  it("allows OWNER/MANAGER match and denies STAFF", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue(activeLead());
    prismaMock.leadMatch.findUnique.mockResolvedValue(null);
    prismaMock.leadMatch.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "match-1", ...data }));

    companyActor("MANAGER");
    await expect(createLeadMatch({ companyId: "company-1", leadId: "lead-1", actorUserId: "company-user" })).resolves.toMatchObject({ status: "ACTIVE" });

    companyActor("STAFF");
    await expect(createLeadMatch({ companyId: "company-1", leadId: "lead-1", actorUserId: "company-user" })).rejects.toThrow(/OWNER or MANAGER/);
  });

  it("returns active match idempotently and reactivates cancelled row without creating a new row", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue(activeLead());
    companyActor("OWNER");
    prismaMock.leadMatch.findUnique.mockResolvedValueOnce({ id: "match-1", companyId: "company-1", leadId: "lead-1", status: "ACTIVE" });
    await expect(createLeadMatch({ companyId: "company-1", leadId: "lead-1", actorUserId: "company-user" })).resolves.toMatchObject({ id: "match-1", status: "ACTIVE" });
    expect(prismaMock.leadMatch.create).not.toHaveBeenCalled();

    prismaMock.leadMatch.findUnique.mockResolvedValue({ id: "match-1", companyId: "company-1", leadId: "lead-1", status: "CANCELLED" });
    prismaMock.leadMatch.update.mockResolvedValue({ id: "match-1", companyId: "company-1", leadId: "lead-1", status: "ACTIVE" });
    await expect(createLeadMatch({ companyId: "company-1", leadId: "lead-1", actorUserId: "company-user" })).resolves.toMatchObject({ status: "ACTIVE" });
    expect(prismaMock.leadMatch.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "match-1" }, data: { status: "ACTIVE", actorUserId: "company-user" } }));
    expect(prismaMock.leadMatch.create).not.toHaveBeenCalled();
  });

  it("falls back from exhausted free quota to generic Company Credit", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue(activeLead("lead-2"));
    prismaMock.leadMatch.findUnique.mockResolvedValue(null);
    prismaMock.leadMatch.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "match-2", ...data }));
    prismaMock.companyQuotaUsage.upsert.mockResolvedValue({ id: "quota-1", companyId: "company-1", allowanceType: "MATCH", windowStart: new Date(), windowEnd: new Date(), consumedCount: 1 });
    prismaMock.companyQuotaUsage.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.creditAccount.findUnique.mockResolvedValue({ id: "account-1", companyId: "company-1", balance: 2_000 });
    prismaMock.creditGrant.findMany.mockResolvedValue([{ id: "grant-1", remainingAmount: 2_000, expiresAt: null, createdAt: new Date() }]);

    await expect(createLeadMatch({ companyId: "company-1", leadId: "lead-2", actorUserId: "company-user" })).resolves.toMatchObject({ id: "match-2", status: "ACTIVE" });
    expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountDelta: -2_000, allowanceType: "MATCH", referenceType: "LeadMatch", referenceId: "lead-2" }) }));
  });

  it("does not create a Match when generic Credit is insufficient", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue(activeLead("lead-3"));
    prismaMock.leadMatch.findUnique.mockResolvedValue(null);
    prismaMock.companyQuotaUsage.upsert.mockResolvedValue({ id: "quota-1", companyId: "company-1", allowanceType: "MATCH", windowStart: new Date(), windowEnd: new Date(), consumedCount: 1 });
    prismaMock.companyQuotaUsage.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.creditAccount.findUnique.mockResolvedValue({ id: "account-1", companyId: "company-1", balance: 0 });
    prismaMock.creditGrant.findMany.mockResolvedValue([]);

    await expect(createLeadMatch({ companyId: "company-1", leadId: "lead-3", actorUserId: "company-user" })).rejects.toThrow(/Insufficient generic/);
    expect(prismaMock.leadMatch.create).not.toHaveBeenCalled();
  });

  it("parses company context and safe filters without trusting arbitrary values", () => {
    const query = parseLeadDiscoveryQuery(new URLSearchParams("companyId=c1&desiredWorkType=FULL_TIME&minExperienceYears=4&leaseExperience=true&page=2"));
    expect(query).toMatchObject({ companyId: "c1", page: 2, filters: { desiredWorkType: "FULL_TIME", minExperienceYears: 4, leaseExperience: true } });
    expect(parseLeadDiscoveryQuery(new URLSearchParams("desiredWorkType=DROP_TABLE")).filters.desiredWorkType).toBeUndefined();
  });
});
