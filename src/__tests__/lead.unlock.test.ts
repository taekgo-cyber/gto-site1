import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_CONSENT_VERSION } from "@/lib/leads/constants";
import { FreeMvpEntitlementAdapter } from "@/lib/leads/entitlement";
import { readUnlockedLeadContact, unlockLeadContact } from "@/lib/leads/service";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  user: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  companyMember: { findUnique: vi.fn() },
  candidateLead: { findUnique: vi.fn(), update: vi.fn() },
  leadMatch: { findUnique: vi.fn() },
  leadContactUnlock: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  companyRecruitmentEntitlement: { findMany: vi.fn() },
  companyQuotaUsage: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  companyQuotaConsumption: { findUnique: vi.fn(), create: vi.fn() },
  creditAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  creditGrant: { findMany: vi.fn(), updateMany: vi.fn() },
  creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

function lead(status = "ACTIVE", expiresAt: Date | null = null) {
  return {
    id: "lead-1",
    userId: "candidate-1",
    status,
    expiresAt,
    consentVersion: LEAD_CONSENT_VERSION,
    consentedAt: new Date(),
    preferredRegionId: null,
    vehicleTypeId: null,
    tonnageId: null,
    experienceYears: 5,
    leaseExperience: true,
    vehicleOwned: false,
    licenseInfo: "1종 대형",
    desiredWorkType: "FULL_TIME",
    desiredIncomeMin: null,
    desiredIncomeMax: null,
    availableFrom: null,
    careerSummary: "운송 경력",
    pausedAt: null,
    closedAt: null,
    closeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function configureCompany(role = "OWNER", companyId = "company-a") {
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === "candidate-1") return { name: "구직자", phone: "010-0000-0000" };
    return { id: where.id, status: "ACTIVE", role: "COMPANY" };
  });
  prismaMock.company.findUnique.mockResolvedValue({ id: companyId, status: "ACTIVE" });
  prismaMock.companyMember.findUnique.mockResolvedValue({ role, status: "ACTIVE" });
}

function configureTransaction() {
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue([]);
  prismaMock.candidateLead.update.mockResolvedValue(lead());
  prismaMock.companyRecruitmentEntitlement.findMany.mockResolvedValue([]);
  prismaMock.companyQuotaConsumption.findUnique.mockResolvedValue(null);
  prismaMock.companyQuotaUsage.findUnique.mockResolvedValue(null);
  prismaMock.companyQuotaUsage.upsert.mockResolvedValue({ id: "quota-1", companyId: "company-a", allowanceType: "CONTACT_UNLOCK", windowStart: new Date(), windowEnd: new Date(), consumedCount: 0 });
  prismaMock.companyQuotaUsage.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.companyQuotaConsumption.create.mockResolvedValue({ id: "quota-consumption-1" });
  prismaMock.creditAccount.findUnique.mockResolvedValue(null);
  prismaMock.creditAccount.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.creditGrant.findMany.mockResolvedValue([]);
  prismaMock.creditGrant.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.creditTransaction.findUnique.mockResolvedValue(null);
  prismaMock.creditTransaction.create.mockResolvedValue({ id: "credit-transaction-1" });
}

function configureActiveMatch() {
  prismaMock.candidateLead.findUnique.mockResolvedValue(lead());
  prismaMock.leadMatch.findUnique.mockResolvedValue({ id: "match-1", status: "ACTIVE", companyId: "company-a", leadId: "lead-1" });
}

describe("contact unlock privacy and entitlement boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureCompany();
    configureTransaction();
    configureActiveMatch();
  });

  it("allows OWNER and returns only name/phone after ACTIVE Match", async () => {
    prismaMock.leadContactUnlock.findUnique.mockResolvedValue(null);
    prismaMock.leadContactUnlock.count.mockResolvedValue(0);
    prismaMock.leadContactUnlock.create.mockResolvedValue({ id: "unlock-1", companyId: "company-a", leadId: "lead-1" });
    const adapter = new FreeMvpEntitlementAdapter();

    const result = await unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: adapter, policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } });

    expect(result.contact).toEqual({ name: "구직자", phone: "010-0000-0000" });
    expect(result.contact).not.toHaveProperty("email");
    expect(result.contact).not.toHaveProperty("userId");
    expect(result.dto).not.toHaveProperty("consentVersion");
    expect(result.dto).not.toHaveProperty("entitlementSource");
  });

  it("denies STAFF, missing match, cancelled match, and inactive lead", async () => {
    configureCompany("STAFF");
    await expect(unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: new FreeMvpEntitlementAdapter(), policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } })).rejects.toThrow(/OWNER or MANAGER/);

    configureCompany("OWNER");
    prismaMock.leadMatch.findUnique.mockResolvedValue(null);
    await expect(unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: new FreeMvpEntitlementAdapter(), policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } })).rejects.toThrow(/LeadMatch required/);

    prismaMock.leadMatch.findUnique.mockResolvedValue({ id: "match-1", status: "CANCELLED" });
    await expect(unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: new FreeMvpEntitlementAdapter(), policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } })).rejects.toThrow(/LeadMatch required/);

    prismaMock.candidateLead.findUnique.mockResolvedValue(lead("PAUSED"));
    prismaMock.leadMatch.findUnique.mockResolvedValue({ id: "match-1", status: "ACTIVE" });
    await expect(unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: new FreeMvpEntitlementAdapter(), policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } })).rejects.toThrow(/not active/);
  });

  it("repeated unlock returns existing contact without consume, count, or new row", async () => {
    const existing = { id: "unlock-1", companyId: "company-a", leadId: "lead-1", entitlementSource: "FREE_MVP", policyVersion: "v1" };
    prismaMock.leadContactUnlock.findUnique.mockResolvedValue(existing);
    const adapter = new FreeMvpEntitlementAdapter();
    const consume = vi.spyOn(adapter, "consumeLeadUnlockEntitlement");

    const result = await unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: adapter, policy: { maxContactUnlocksPerLead: 1, policyVersion: "v1" } });

    expect(result.alreadyUnlocked).toBe(true);
    expect(result.contact).toEqual({ name: "구직자", phone: "010-0000-0000" });
    expect(consume).not.toHaveBeenCalled();
    expect(prismaMock.leadContactUnlock.count).not.toHaveBeenCalled();
    expect(prismaMock.leadContactUnlock.create).not.toHaveBeenCalled();
  });

  it("enforces cap and allows independent Company A/B unlock rows", async () => {
    prismaMock.leadContactUnlock.findUnique.mockResolvedValue(null);
    prismaMock.leadContactUnlock.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    prismaMock.leadContactUnlock.count.mockResolvedValue(0);
    const adapter = new FreeMvpEntitlementAdapter();

    await unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: adapter, policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } });
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-b", status: "ACTIVE" });
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "MANAGER", status: "ACTIVE" });
    await unlockLeadContact({ companyId: "company-b", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: adapter, policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } });
    expect(prismaMock.leadContactUnlock.create).toHaveBeenCalledTimes(2);

    prismaMock.leadContactUnlock.count.mockResolvedValue(2);
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-c", status: "ACTIVE" });
    await expect(unlockLeadContact({ companyId: "company-c", leadId: "lead-1", actorUserId: "company-user", entitlementAdapter: adapter, policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } })).rejects.toThrow(/cap reached/);
  });

  it("re-fetches contact only while Lead is effectively ACTIVE", async () => {
    const existing = { id: "unlock-1", companyId: "company-a", leadId: "lead-1", entitlementSource: "FREE_MVP", policyVersion: "v1" };
    prismaMock.leadContactUnlock.findUnique.mockResolvedValue(existing);
    await expect(readUnlockedLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user" })).resolves.toMatchObject({ contact: { name: "구직자", phone: "010-0000-0000" } });

    prismaMock.candidateLead.findUnique.mockResolvedValue(lead("CLOSED"));
    await expect(readUnlockedLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user" })).rejects.toThrow(/not active/);
  });

  it("uses generic Company Credit for a production-path unlock when free quota is zero", async () => {
    prismaMock.leadContactUnlock.findUnique.mockResolvedValue(null);
    prismaMock.leadContactUnlock.count.mockResolvedValue(0);
    prismaMock.leadContactUnlock.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "unlock-paid", ...data }));
    prismaMock.creditAccount.findUnique.mockResolvedValue({ id: "account-1", companyId: "company-a", balance: 20_000 });
    prismaMock.creditGrant.findMany.mockResolvedValue([{ id: "grant-1", remainingAmount: 20_000, expiresAt: null, createdAt: new Date() }]);

    const result = await unlockLeadContact({ companyId: "company-a", leadId: "lead-1", actorUserId: "company-user", policy: { maxContactUnlocksPerLead: 2, policyVersion: "v1" } });
    expect(result.unlock.entitlementSource).toBe("CREDIT");
    expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountDelta: -20_000, allowanceType: "CONTACT_UNLOCK", referenceType: "LeadContactUnlock" }) }));
  });
});
