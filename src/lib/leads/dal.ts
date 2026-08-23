import { prisma } from "@/lib/prisma";
import type { CandidateLeadStatus } from "./types";
import { isInactiveByExpiry } from "./validation";

export type LeadForLifecycle = {
  id: string;
  userId: string;
  status: CandidateLeadStatus;
  consentVersion: string | null;
  consentedAt: Date | null;
  expiresAt: Date | null;
  pausedAt: Date | null;
  closedAt: Date | null;
  closeReason: string | null;
};

export async function getLeadById(leadId: string) {
  return prisma.candidateLead.findUnique({ where: { id: leadId } });
}

export async function getActiveLeadForUser(userId: string) {
  return prisma.candidateLead.findFirst({
    where: {
      userId,
      status: { in: ["DRAFT", "ACTIVE", "PAUSED"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestLeadForUser(userId: string) {
  return prisma.candidateLead.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOwnedLeadForUser(leadId: string, userId: string) {
  const lead = await prisma.candidateLead.findUnique({ where: { id: leadId } });
  if (!lead || lead.userId !== userId) return null;

  if ((lead.status === "ACTIVE" || lead.status === "PAUSED") && isInactiveByExpiry(lead.expiresAt)) {
    return prisma.candidateLead.update({
      where: { id: leadId },
      data: { status: "EXPIRED" },
    });
  }

  return lead;
}

export async function countNonTerminalLeadsForUser(userId: string): Promise<number> {
  return prisma.candidateLead.count({
    where: { userId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } },
  });
}

export type LeadDiscoveryFilters = {
  preferredRegionId?: string;
  vehicleTypeId?: string;
  tonnageId?: string;
  minExperienceYears?: number;
  leaseExperience?: boolean;
  vehicleOwned?: boolean;
  desiredWorkType?: string;
  availableFromBefore?: Date;
};

function discoveryWhere(filters: LeadDiscoveryFilters = {}) {
  return {
    status: "ACTIVE" as const,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    ...(filters.preferredRegionId ? { preferredRegionId: filters.preferredRegionId } : {}),
    ...(filters.vehicleTypeId ? { vehicleTypeId: filters.vehicleTypeId } : {}),
    ...(filters.tonnageId ? { tonnageId: filters.tonnageId } : {}),
    ...(filters.minExperienceYears != null ? { experienceYears: { gte: filters.minExperienceYears } } : {}),
    ...(filters.leaseExperience != null ? { leaseExperience: filters.leaseExperience } : {}),
    ...(filters.vehicleOwned != null ? { vehicleOwned: filters.vehicleOwned } : {}),
    ...(filters.desiredWorkType ? { desiredWorkType: filters.desiredWorkType as never } : {}),
    ...(filters.availableFromBefore ? { availableFrom: { lte: filters.availableFromBefore } } : {}),
  };
}

const discoverableIncludes = {
  preferredRegion: { select: { id: true, name: true } },
  vehicleType: { select: { id: true, name: true } },
  tonnage: { select: { id: true, name: true } },
} as const;

export async function findDiscoverableLeads(input: { take?: number; skip?: number } & LeadDiscoveryFilters = {}) {
  return prisma.candidateLead.findMany({
    where: discoveryWhere(input),
    take: input.take ?? 20,
    skip: input.skip ?? 0,
    orderBy: { updatedAt: "desc" },
    include: discoverableIncludes,
  });
}

export async function countDiscoverableLeads(filters: LeadDiscoveryFilters = {}) {
  return prisma.candidateLead.count({ where: discoveryWhere(filters) });
}

export async function findDiscoverableLeadById(leadId: string) {
  return prisma.candidateLead.findFirst({
    where: { id: leadId, ...discoveryWhere() },
    include: discoverableIncludes,
  });
}

// More precise discoverable query handling null expiresAt
export async function findEffectiveActiveLeads() {
  const all = await prisma.candidateLead.findMany({
    where: { status: "ACTIVE" },
    include: {
      preferredRegion: { select: { id: true, name: true } },
      vehicleType: { select: { id: true, name: true } },
      tonnage: { select: { id: true, name: true } },
    },
  });
  return all.filter((l) => !isInactiveByExpiry(l.expiresAt));
}

export async function normalizeExpiredLead(leadId: string): Promise<void> {
  const lead = await prisma.candidateLead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  if (lead.status !== "ACTIVE" && lead.status !== "PAUSED") return;
  if (!isInactiveByExpiry(lead.expiresAt)) return;
  await prisma.candidateLead.update({
    where: { id: leadId },
    data: { status: "EXPIRED" },
  });
}

// Transactional normalize + return fresh
export async function getLeadWithExpiryNormalization(leadId: string) {
  const lead = await prisma.candidateLead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  if ((lead.status === "ACTIVE" || lead.status === "PAUSED") && isInactiveByExpiry(lead.expiresAt)) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.candidateLead.update({
        where: { id: leadId },
        data: { status: "EXPIRED" },
      });
      return updated;
    });
  }
  return lead;
}

export async function getLeadMatch(companyId: string, leadId: string) {
  return prisma.leadMatch.findUnique({ where: { companyId_leadId: { companyId, leadId } } });
}

export async function getLeadUnlock(companyId: string, leadId: string) {
  return prisma.leadContactUnlock.findUnique({ where: { companyId_leadId: { companyId, leadId } } });
}
