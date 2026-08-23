import { prisma } from "@/lib/prisma";
import { resolveActiveCompanyActor, canMatchOrUnlock } from "./authorization";
import { toPreUnlockDto, type PreUnlockLeadDto } from "./dto";
import type { CandidateLeadStatus, LeadMatchStatus } from "./types";
import type { CompanyOperationsFilter } from "./operations-validation";

// ---------------------------------------------------------------------------
// DTO boundaries
// ---------------------------------------------------------------------------

export type CandidateOperationsItem = {
  leadId: string;
  leadStatus: CandidateLeadStatus;
  companyId: string;
  companyName: string;
  matchStatus: LeadMatchStatus;
  matchCreatedAt: Date;
  matchUpdatedAt: Date;
  hasUnlock: boolean;
  unlockedAt: Date | null;
};

export type CandidateOperationsPage = {
  items: CandidateOperationsItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type CompanyOperationsItem = {
  leadId: string;
  leadStatus: CandidateLeadStatus;
  candidateSummary: PreUnlockLeadDto;
  matchStatus: LeadMatchStatus;
  matchCreatedAt: Date;
  matchUpdatedAt: Date;
  hasUnlock: boolean;
  unlockedAt: Date | null;
};

export type CompanyOperationsPage = {
  items: CompanyOperationsItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  filter: CompanyOperationsFilter;
};

// ---------------------------------------------------------------------------
// Candidate operations: own Lead-linked company activity
// Isolation: actorUserId is authoritative; no arbitrary leadId exposure
// ---------------------------------------------------------------------------

export async function listCandidateOperations(input: {
  actorUserId: string;
  page?: number;
  pageSize?: number;
}): Promise<CandidateOperationsPage> {
  const actorUserId = input.actorUserId;
  if (!actorUserId) throw new Error("actorUserId required");

  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);

  // Find all leads owned by this actor (history retained for PAUSED/CLOSED/EXPIRED)
  const leads = await prisma.candidateLead.findMany({
    where: { userId: actorUserId },
    select: { id: true, status: true },
  });

  if (leads.length === 0) {
    return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
  }

  const leadIds = leads.map((l) => l.id);
  const leadStatusById = new Map(leads.map((l) => [l.id, l.status as CandidateLeadStatus]));

  const matches = await prisma.leadMatch.findMany({
    where: { leadId: { in: leadIds } },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (matches.length === 0) {
    return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
  }

  const unlocks = await prisma.leadContactUnlock.findMany({
    where: { leadId: { in: leadIds } },
    select: { companyId: true, leadId: true, unlockedAt: true },
  });
  const unlockKey = new Map(unlocks.map((u) => [`${u.companyId}:${u.leadId}`, u.unlockedAt]));

  const allItems: CandidateOperationsItem[] = matches.map((m) => {
    const key = `${m.companyId}:${m.leadId}`;
    const unlockedAt = unlockKey.get(key) ?? null;
    return {
      leadId: m.leadId,
      leadStatus: leadStatusById.get(m.leadId) ?? ("ACTIVE" as CandidateLeadStatus),
      companyId: m.company.id,
      companyName: m.company.name,
      matchStatus: m.status as LeadMatchStatus,
      matchCreatedAt: m.createdAt,
      matchUpdatedAt: m.updatedAt,
      hasUnlock: unlockedAt !== null,
      unlockedAt,
    };
  });

  // Bounded pagination: server-normalized page/pageSize, cap 50, slice and return metadata
  const totalCount = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pagedItems = allItems.slice((page - 1) * pageSize, page * pageSize);

  // Privacy: never expose actor name, internal userId beyond actorUserId, company phone/email, entitlement internals
  // All fields above are safe: company name only, no actor name, no phone/email, no entitlementSource

  return { items: pagedItems, page, pageSize, totalCount, totalPages };
}

// Single lead isolation check for detail re-entry (safe)
export async function getCandidateOperationDetail(input: {
  actorUserId: string;
  leadId: string;
}): Promise<CandidateOperationsItem[] | null> {
  const lead = await prisma.candidateLead.findUnique({
    where: { id: input.leadId },
    select: { id: true, userId: true, status: true },
  });
  if (!lead) return null;
  if (lead.userId !== input.actorUserId) {
    // Isolation: do not expose another user's history
    throw new Error("Forbidden: candidate isolation");
  }
  const matches = await prisma.leadMatch.findMany({
    where: { leadId: lead.id },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const unlocks = await prisma.leadContactUnlock.findMany({
    where: { leadId: lead.id },
    select: { companyId: true, leadId: true, unlockedAt: true },
  });
  const unlockKey = new Map(unlocks.map((u) => [`${u.companyId}:${u.leadId}`, u.unlockedAt]));
  return matches.map((m) => ({
    leadId: m.leadId,
    leadStatus: lead.status as CandidateLeadStatus,
    companyId: m.company.id,
    companyName: m.company.name,
    matchStatus: m.status as LeadMatchStatus,
    matchCreatedAt: m.createdAt,
    matchUpdatedAt: m.updatedAt,
    hasUnlock: unlockKey.has(`${m.companyId}:${m.leadId}`),
    unlockedAt: unlockKey.get(`${m.companyId}:${m.leadId}`) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Company operations: selected active Company bounded list
// ---------------------------------------------------------------------------

async function assertCompanyOpsAccess(actorUserId: string, companyId: string) {
  const result = await resolveActiveCompanyActor(actorUserId, companyId);
  if (!result.ok) throw new Error(result.message);
  if (!canMatchOrUnlock(result.actor)) throw new Error("Forbidden: company operations not allowed");
  return result.actor;
}

function clampPage(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return Math.min(10_000, n);
}

function clampPageSize(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 20;
  return Math.min(50, Math.max(1, n));
}

export async function listCompanyOperations(input: {
  actorUserId: string;
  companyId: string;
  page?: number;
  pageSize?: number;
  filter?: CompanyOperationsFilter;
}): Promise<CompanyOperationsPage> {
  const companyId = input.companyId;
  if (!companyId) throw new Error("companyId required");
  await assertCompanyOpsAccess(input.actorUserId, companyId);

  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const filter: CompanyOperationsFilter = input.filter ?? "ALL";

  // Fetch matches for this company (cross-company isolation via companyId)
  // History visible even when CandidateLead is PAUSED/CLOSED/EXPIRED - do not filter lead status
  const where: { companyId: string; status?: LeadMatchStatus } = { companyId };
  if (filter === "ACTIVE") where.status = "ACTIVE";
  else if (filter === "CANCELLED") where.status = "CANCELLED";
  // UNLOCKED derived from LeadContactUnlock existence, not match status

  let matches = await prisma.leadMatch.findMany({
    where,
    include: {
      lead: {
        include: {
          preferredRegion: { select: { id: true, name: true } },
          vehicleType: { select: { id: true, name: true } },
          tonnage: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // For UNLOCKED filter, narrow to those where unlock exists
  let unlockMap = new Map<string, Date>();
  if (matches.length > 0) {
    const unlocks = await prisma.leadContactUnlock.findMany({
      where: { companyId },
      select: { leadId: true, unlockedAt: true },
    });
    unlockMap = new Map(unlocks.map((u) => [u.leadId, u.unlockedAt]));
    if (filter === "UNLOCKED") {
      matches = matches.filter((m) => unlockMap.has(m.leadId));
    }
  }

  const totalCount = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paged = matches.slice((page - 1) * pageSize, page * pageSize);

  const items: CompanyOperationsItem[] = paged.map((m) => {
    const lead = m.lead as unknown as Parameters<typeof toPreUnlockDto>[0];
    const candidateSummary = toPreUnlockDto(lead);
    // Privacy: pre-unlock DTO must not serialize candidate name/phone/email/userId
    // Even if unlocked, do NOT bulk return phone/name; contact refetch remains separate authorized boundary
    const unlockedAt = unlockMap.get(m.leadId) ?? null;
    return {
      leadId: m.leadId,
      leadStatus: (m.lead.status as CandidateLeadStatus),
      candidateSummary,
      matchStatus: m.status as LeadMatchStatus,
      matchCreatedAt: m.createdAt,
      matchUpdatedAt: m.updatedAt,
      hasUnlock: unlockedAt !== null,
      unlockedAt,
    };
  });

  return { items, page, pageSize, totalCount, totalPages, filter };
}
