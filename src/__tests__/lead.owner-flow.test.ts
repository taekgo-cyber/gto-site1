import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_CONSENT_VERSION } from "@/lib/leads/constants";
import {
  activateCandidateLead,
  createCandidateLead,
  transitionOwnedLeadStatus,
  updateCandidateLead,
} from "@/lib/leads/service";
import { getOwnedLeadForUser } from "@/lib/leads/dal";
import { validateLeadForActivation } from "@/lib/leads/validation";
import * as fs from "node:fs";
import * as path from "node:path";

const prismaMock = vi.hoisted(() => ({
  candidateLead: {
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    userId: "user-1",
    status: "DRAFT",
    preferredRegionId: "region-1",
    vehicleTypeId: null,
    tonnageId: null,
    experienceYears: 3,
    leaseExperience: true,
    vehicleOwned: null,
    licenseInfo: "1종 대형",
    desiredWorkType: "FULL_TIME",
    desiredIncomeMin: null,
    desiredIncomeMax: null,
    availableFrom: null,
    careerSummary: "운송 경력 3년",
    consentVersion: null,
    consentedAt: null,
    expiresAt: null,
    pausedAt: null,
    closedAt: null,
    closeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mutableData = {
  preferredRegionId: "region-1",
  vehicleTypeId: null,
  tonnageId: null,
  experienceYears: 3,
  leaseExperience: true,
  vehicleOwned: null,
  licenseInfo: "1종 대형",
  desiredWorkType: "FULL_TIME" as const,
  desiredIncomeMin: null,
  desiredIncomeMax: null,
  availableFrom: null,
  careerSummary: "운송 경력 3년",
  expiresAt: null,
};

describe("candidate owner flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  it("allows a DRAFT without consent and keeps consent columns empty", async () => {
    prismaMock.candidateLead.count.mockResolvedValue(0);
    prismaMock.candidateLead.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);

    const result = await createCandidateLead({ userId: "user-1", data: mutableData });

    expect(result).toMatchObject({ status: "DRAFT", consentVersion: null, consentedAt: null });
  });

  it("activates only with minimum data and server consent timestamp", async () => {
    prismaMock.candidateLead.findUnique
      .mockResolvedValueOnce(draft())
      .mockResolvedValueOnce(draft());
    prismaMock.candidateLead.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...draft(), ...data }));

    const result = await activateCandidateLead({ userId: "user-1", leadId: "lead-1", consentVersion: LEAD_CONSENT_VERSION });

    expect(result).toMatchObject({ status: "ACTIVE", consentVersion: LEAD_CONSENT_VERSION });
    expect(result.consentedAt).toBeInstanceOf(Date);
    expect(prismaMock.candidateLead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACTIVE", consentVersion: LEAD_CONSENT_VERSION }),
    }));
  });

  it("rejects another user's read/update/lifecycle access", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue(draft({ userId: "other-user" }));

    await expect(getOwnedLeadForUser("lead-1", "user-1")).resolves.toBeNull();
    await expect(updateCandidateLead({ userId: "user-1", leadId: "lead-1", data: mutableData })).rejects.toThrow(/owner/);
    await expect(transitionOwnedLeadStatus({ userId: "user-1", leadId: "lead-1", targetStatus: "ACTIVE" })).rejects.toThrow(/owner/);
    expect(prismaMock.candidateLead.update).not.toHaveBeenCalled();
  });

  it("normalizes an expired active lead before denying pause/resume", async () => {
    prismaMock.candidateLead.findUnique.mockResolvedValue(draft({
      status: "ACTIVE",
      consentVersion: LEAD_CONSENT_VERSION,
      consentedAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() - 1000),
    }));

    await expect(transitionOwnedLeadStatus({ userId: "user-1", leadId: "lead-1", targetStatus: "PAUSED" })).rejects.toThrow(/expired/);
    expect(prismaMock.candidateLead.update).toHaveBeenCalledWith({ where: { id: "lead-1" }, data: { status: "EXPIRED" } });
  });

  it("enforces the selected ACTIVE minimum and does not copy PII", () => {
    expect(() => validateLeadForActivation({ ...mutableData, preferredRegionId: null })).toThrow(/preferredRegionId/);
    expect(() => validateLeadForActivation({ ...mutableData, desiredWorkType: null })).toThrow(/desiredWorkType/);

    const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/consentVersion\s+String\?/);
    expect(schema).toMatch(/consentedAt\s+DateTime\?/);
    expect(schema.slice(schema.indexOf("model CandidateLead"), schema.indexOf("model LeadMatch"))).not.toMatch(/\b(phone|email|name)\b/);
  });
});
