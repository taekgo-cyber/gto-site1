import { prisma } from "@/lib/prisma";
import { validateMetricsDateRange } from "./metrics-validation";

export type LeadMetrics = {
  leads: {
    total: number;
    active: number;
    newCount: number;
    newFrom: string | null;
    newTo: string | null;
  };
  matches: {
    total: number;
    active: number;
    cancelled: number;
    avgPerLead: number;
    avgPerLeadDenominator: number;
  };
  unlocks: {
    total: number;
    avgPerLead: number;
    avgPerLeadDenominator: number;
  };
  conversion: {
    uniqueMatchedPairs: number;
    uniqueUnlockedMatchedPairs: number;
    rate: number;
  };
  perCompany: Array<{
    companyId: string;
    companyName: string;
    matchCount: number;
    unlockCount: number;
    conversionRate: number;
  }>;
  timing: {
    avgFirstMatchMs: number | null;
    avgFirstMatchSampleCount: number;
    avgFirstUnlockMs: number | null;
    avgFirstUnlockSampleCount: number;
  };
};

async function assertActiveAdmin(actorUserId: string): Promise<void> {
  if (!actorUserId) throw new Error("ADMIN_REQUIRED");
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, status: true, role: true },
  });
  if (!user || user.status !== "ACTIVE" || user.role !== "ADMIN") {
    throw new Error("ADMIN_REQUIRED");
  }
}

export async function getLeadMetrics(input: {
  actorUserId: string;
  from?: string | Date | null;
  to?: string | Date | null;
}): Promise<LeadMetrics> {
  // Session actor must be ACTIVE ADMIN; ignore any client-provided adminUserId
  await assertActiveAdmin(input.actorUserId);

  // Optional [from,to) dates: invalid dates and from>to reject safely
  const { from, to } = validateMetricsDateRange({ from: input.from, to: input.to });

  // --- Lead counts (read-only aggregation) ---
  const [leadTotal, leadActive] = await Promise.all([
    prisma.candidateLead.count(),
    prisma.candidateLead.count({ where: { status: "ACTIVE" } }),
  ]);

  let leadNew = 0;
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lt = to;
    leadNew = await prisma.candidateLead.count({ where: { createdAt } });
  }

  // --- Match counts ---
  const [matchTotal, matchActive, matchCancelled] = await Promise.all([
    prisma.leadMatch.count(),
    prisma.leadMatch.count({ where: { status: "ACTIVE" } }),
    prisma.leadMatch.count({ where: { status: "CANCELLED" } }),
  ]);

  // Explicit denominator: total leads — never NaN/Infinity
  const matchDenominator = leadTotal;
  const unlockDenominator = leadTotal;
  const rawAvgMatch = matchDenominator > 0 ? matchTotal / matchDenominator : 0;
  const avgMatchPerLead = Number.isFinite(rawAvgMatch) ? rawAvgMatch : 0;

  // --- Unlock total ---
  const unlockTotal = await prisma.leadContactUnlock.count();
  const rawAvgUnlock = unlockDenominator > 0 ? unlockTotal / unlockDenominator : 0;
  const avgUnlockPerLead = Number.isFinite(rawAvgUnlock) ? rawAvgUnlock : 0;

  // --- Conversion: unique matched companyId+leadId with unlock / unique matched keys ---
  // Bounded select: only IDs
  const matchPairs = (await prisma.leadMatch.findMany({
    select: { companyId: true, leadId: true },
  })) as Array<{ companyId: string; leadId: string }>;

  const unlockPairs = (await prisma.leadContactUnlock.findMany({
    select: { companyId: true, leadId: true },
  })) as Array<{ companyId: string; leadId: string }>;

  const matchSet = new Set<string>();
  for (const p of matchPairs) matchSet.add(`${p.companyId}:${p.leadId}`);
  const unlockSet = new Set<string>();
  for (const p of unlockPairs) unlockSet.add(`${p.companyId}:${p.leadId}`);

  const uniqueMatchedPairs = matchSet.size;
  let uniqueUnlockedMatchedPairs = 0;
  for (const key of unlockSet) {
    if (matchSet.has(key)) uniqueUnlockedMatchedPairs += 1;
  }
  const rawConversion = uniqueMatchedPairs > 0 ? uniqueUnlockedMatchedPairs / uniqueMatchedPairs : 0;
  const conversionRate = Number.isFinite(rawConversion) ? rawConversion : 0;

  // --- Per-company: name/match/unlock/conversion ---
  // Use groupBy for counts (avoid N+1), then one batched company lookup
  type GroupRow = { companyId: string; _count: { _all: number } };
  const [matchGroups, unlockGroups] = await Promise.all([
    (prisma.leadMatch.groupBy as unknown as (args: unknown) => Promise<GroupRow[]>)({
      by: ["companyId"],
      _count: { _all: true },
    }),
    (prisma.leadContactUnlock.groupBy as unknown as (args: unknown) => Promise<GroupRow[]>)({
      by: ["companyId"],
      _count: { _all: true },
    }),
  ]);

  const matchCountByCompany = new Map<string, number>();
  for (const g of matchGroups) matchCountByCompany.set(g.companyId, g._count._all);
  const unlockCountByCompany = new Map<string, number>();
  for (const g of unlockGroups) unlockCountByCompany.set(g.companyId, g._count._all);

  const allCompanyIds = Array.from(
    new Set([...matchCountByCompany.keys(), ...unlockCountByCompany.keys()]),
  );

  let perCompany: LeadMetrics["perCompany"] = [];
  if (allCompanyIds.length > 0) {
    const companies = (await prisma.company.findMany({
      where: { id: { in: allCompanyIds } },
      select: { id: true, name: true },
    })) as Array<{ id: string; name: string }>;
    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    perCompany = allCompanyIds
      .map((companyId) => {
        const matchCount = matchCountByCompany.get(companyId) ?? 0;
        const unlockCount = unlockCountByCompany.get(companyId) ?? 0;
        const rawConv = matchCount > 0 ? unlockCount / matchCount : 0;
        const conversion = Number.isFinite(rawConv) ? rawConv : 0;
        return {
          companyId,
          companyName: nameById.get(companyId) ?? companyId,
          matchCount,
          unlockCount,
          conversionRate: conversion,
        };
      })
      .sort((a, b) => b.matchCount - a.matchCount || a.companyName.localeCompare(b.companyName));
  }

  // --- Timing: average first Match latency and first Unlock latency with sample counts ---
  // Select only IDs/status/timestamps for timing
  const leadsForTiming = (await prisma.candidateLead.findMany({
    select: { id: true, createdAt: true },
  })) as Array<{ id: string; createdAt: Date }>;

  const matchesForTiming = (await prisma.leadMatch.findMany({
    select: { leadId: true, createdAt: true },
  })) as Array<{ leadId: string; createdAt: Date }>;

  const unlocksForTiming = (await prisma.leadContactUnlock.findMany({
    select: { leadId: true, unlockedAt: true, createdAt: true },
  })) as Array<{ leadId: string; unlockedAt: Date | null; createdAt: Date }>;

  const firstMatchByLead = new Map<string, Date>();
  for (const m of matchesForTiming) {
    const existing = firstMatchByLead.get(m.leadId);
    if (!existing || m.createdAt.getTime() < existing.getTime()) firstMatchByLead.set(m.leadId, m.createdAt);
  }

  const firstUnlockByLead = new Map<string, Date>();
  for (const u of unlocksForTiming) {
    const ts = u.unlockedAt ?? u.createdAt;
    if (!ts) continue;
    const existing = firstUnlockByLead.get(u.leadId);
    if (!existing || ts.getTime() < existing.getTime()) firstUnlockByLead.set(u.leadId, ts);
  }

  let sumFirstMatchMs = 0;
  let firstMatchSampleCount = 0;
  let sumFirstUnlockMs = 0;
  let firstUnlockSampleCount = 0;

  const leadCreatedAtById = new Map<string, Date>();
  for (const l of leadsForTiming) leadCreatedAtById.set(l.id, l.createdAt);

  for (const [leadId, firstMatchAt] of firstMatchByLead.entries()) {
    const leadCreatedAt = leadCreatedAtById.get(leadId);
    if (!leadCreatedAt) continue;
    const diff = firstMatchAt.getTime() - leadCreatedAt.getTime();
    if (diff >= 0) {
      sumFirstMatchMs += diff;
      firstMatchSampleCount += 1;
    }
  }

  for (const [leadId, firstUnlockAt] of firstUnlockByLead.entries()) {
    const leadCreatedAt = leadCreatedAtById.get(leadId);
    if (!leadCreatedAt) continue;
    const diff = firstUnlockAt.getTime() - leadCreatedAt.getTime();
    if (diff >= 0) {
      sumFirstUnlockMs += diff;
      firstUnlockSampleCount += 1;
    }
  }

  const avgFirstMatchMs = firstMatchSampleCount > 0 ? Math.round(sumFirstMatchMs / firstMatchSampleCount) : null;
  const avgFirstUnlockMs = firstUnlockSampleCount > 0 ? Math.round(sumFirstUnlockMs / firstUnlockSampleCount) : null;

  return {
    leads: {
      total: leadTotal,
      active: leadActive,
      newCount: leadNew,
      newFrom: from ? from.toISOString() : null,
      newTo: to ? to.toISOString() : null,
    },
    matches: {
      total: matchTotal,
      active: matchActive,
      cancelled: matchCancelled,
      avgPerLead: avgMatchPerLead,
      avgPerLeadDenominator: matchDenominator,
    },
    unlocks: {
      total: unlockTotal,
      avgPerLead: avgUnlockPerLead,
      avgPerLeadDenominator: unlockDenominator,
    },
    conversion: {
      uniqueMatchedPairs,
      uniqueUnlockedMatchedPairs,
      rate: conversionRate,
    },
    perCompany,
    timing: {
      avgFirstMatchMs,
      avgFirstMatchSampleCount: firstMatchSampleCount,
      avgFirstUnlockMs,
      avgFirstUnlockSampleCount: firstUnlockSampleCount,
    },
  };
}
