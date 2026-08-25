import { prisma } from "@/lib/prisma";
import {
  RECOMMENDATION_SOURCE_LIMIT,
  type PublicRecommendationItem,
  type RecommendationCandidate,
  type RecommendationReason,
  type RecommendationSeed,
} from "./contract";
import { rankRecommendations } from "./ranking";

type TaxonomySeed = {
  regionIds: string[];
  vehicleTypeId: string | null;
  tonnageId: string | null;
};

function joinContext(values: Array<string | null | undefined>): string | null {
  const context = values.filter((value): value is string => Boolean(value)).join(" · ");
  return context || null;
}

function candidateReasons(input: {
  seed: TaxonomySeed;
  regionIds: Array<string | null>;
  vehicleTypeId: string | null;
  tonnageId: string | null;
}): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  if (input.regionIds.some((id) => id && input.seed.regionIds.includes(id))) {
    reasons.push({ signal: "REGION", label: "같은 지역" });
  }
  if (input.seed.vehicleTypeId && input.vehicleTypeId === input.seed.vehicleTypeId) {
    reasons.push({ signal: "VEHICLE_TYPE", label: "같은 차종" });
  }
  if (input.seed.tonnageId && input.tonnageId === input.seed.tonnageId) {
    reasons.push({ signal: "TONNAGE", label: "같은 톤수" });
  }
  return reasons;
}

function signalWhere(seed: TaxonomySeed) {
  return [
    ...(seed.regionIds.length > 0
      ? [
          { originRegionId: { in: seed.regionIds } },
          { destRegionId: { in: seed.regionIds } },
        ]
      : []),
    ...(seed.vehicleTypeId ? [{ vehicleTypeId: seed.vehicleTypeId }] : []),
    ...(seed.tonnageId ? [{ tonnageId: seed.tonnageId }] : []),
  ];
}

function leaseSignalWhere(seed: TaxonomySeed) {
  return [
    ...(seed.regionIds.length > 0 ? [{ regionId: { in: seed.regionIds } }] : []),
    ...(seed.vehicleTypeId ? [{ vehicleTypeId: seed.vehicleTypeId }] : []),
    ...(seed.tonnageId ? [{ tonnageId: seed.tonnageId }] : []),
  ];
}

async function loadSeed(seed: RecommendationSeed, now: Date): Promise<TaxonomySeed | null> {
  if (seed.domain === "JOBS") {
    const row = await prisma.jobPost.findFirst({
      where: {
        id: seed.id,
        status: "OPEN",
        deletedAt: null,
        publishedAt: { lte: now, not: null },
      },
      select: {
        originRegionId: true,
        destRegionId: true,
        vehicleTypeId: true,
        tonnageId: true,
      },
    });
    if (!row) return null;
    return {
      regionIds: [row.originRegionId, row.destRegionId].filter(
        (id): id is string => Boolean(id),
      ),
      vehicleTypeId: row.vehicleTypeId,
      tonnageId: row.tonnageId,
    };
  }

  const row = await prisma.leasePost.findFirst({
    where: {
      id: seed.id,
      status: "PUBLISHED",
      deletedAt: null,
      publishedAt: { lte: now, not: null },
    },
    select: { regionId: true, vehicleTypeId: true, tonnageId: true },
  });
  if (!row) return null;
  return {
    regionIds: row.regionId ? [row.regionId] : [],
    vehicleTypeId: row.vehicleTypeId,
    tonnageId: row.tonnageId,
  };
}

async function loadJobCandidates(
  seedRef: RecommendationSeed,
  seed: TaxonomySeed,
  now: Date,
): Promise<RecommendationCandidate[]> {
  const signals = signalWhere(seed);
  if (signals.length === 0) return [];

  const rows = await prisma.jobPost.findMany({
    where: {
      ...(seedRef.domain === "JOBS" ? { id: { not: seedRef.id } } : {}),
      status: "OPEN",
      deletedAt: null,
      publishedAt: { lte: now, not: null },
      OR: signals,
    },
    select: {
      id: true,
      title: true,
      publishedAt: true,
      originRegionId: true,
      destRegionId: true,
      vehicleTypeId: true,
      tonnageId: true,
      company: { select: { name: true } },
      originRegion: { select: { name: true } },
      destRegion: { select: { name: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: RECOMMENDATION_SOURCE_LIMIT,
  });

  return rows.flatMap((row): RecommendationCandidate[] =>
    row.publishedAt
      ? [{
          id: row.id,
          domain: "JOBS",
          title: row.title,
          href: `/jobs/${row.id}`,
          context: joinContext([
            row.company?.name,
            row.originRegion?.name && row.destRegion?.name
              ? `${row.originRegion.name} → ${row.destRegion.name}`
              : row.originRegion?.name ?? row.destRegion?.name,
          ]),
          publishedAt: row.publishedAt,
          reasons: candidateReasons({
            seed,
            regionIds: [row.originRegionId, row.destRegionId],
            vehicleTypeId: row.vehicleTypeId,
            tonnageId: row.tonnageId,
          }),
        }]
      : [],
  );
}

async function loadLeaseCandidates(
  seedRef: RecommendationSeed,
  seed: TaxonomySeed,
  now: Date,
): Promise<RecommendationCandidate[]> {
  const signals = leaseSignalWhere(seed);
  if (signals.length === 0) return [];

  const rows = await prisma.leasePost.findMany({
    where: {
      ...(seedRef.domain === "LEASE" ? { id: { not: seedRef.id } } : {}),
      status: "PUBLISHED",
      deletedAt: null,
      publishedAt: { lte: now, not: null },
      OR: signals,
    },
    select: {
      id: true,
      title: true,
      publishedAt: true,
      regionId: true,
      vehicleTypeId: true,
      tonnageId: true,
      region: { select: { name: true } },
      vehicleType: { select: { name: true } },
      tonnage: { select: { name: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: RECOMMENDATION_SOURCE_LIMIT,
  });

  return rows.flatMap((row): RecommendationCandidate[] =>
    row.publishedAt
      ? [{
          id: row.id,
          domain: "LEASE",
          title: row.title,
          href: `/lease/${row.id}`,
          context: joinContext([
            row.region?.name,
            row.vehicleType?.name,
            row.tonnage?.name,
          ]),
          publishedAt: row.publishedAt,
          reasons: candidateReasons({
            seed,
            regionIds: [row.regionId],
            vehicleTypeId: row.vehicleTypeId,
            tonnageId: row.tonnageId,
          }),
        }]
      : [],
  );
}

export async function getPublicRecommendations(
  seedRef: RecommendationSeed,
  now = new Date(),
): Promise<PublicRecommendationItem[]> {
  const seed = await loadSeed(seedRef, now);
  if (!seed) return [];
  if (seed.regionIds.length === 0 && !seed.vehicleTypeId && !seed.tonnageId) return [];

  const [jobs, leases] = await Promise.all([
    loadJobCandidates(seedRef, seed, now),
    loadLeaseCandidates(seedRef, seed, now),
  ]);
  return rankRecommendations([...jobs, ...leases]);
}
