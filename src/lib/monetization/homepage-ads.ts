import { publicCompanyHref, publicJobHref, publicLeaseHref } from "@/lib/public-detail-links";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAdvertisementUrl } from "./ads";
import { assertAdvertisingEntitlementCovers } from "./advertisement-entitlements";
import {
  ADVERTISEMENT_PRODUCT_CATALOG,
  COMPANY_BANNER_PRODUCT,
  HOMEPAGE_AD_INVENTORY_CAPACITY,
  HOMEPAGE_AD_PLACEMENTS,
  getHomepageAdvertisementProductContract,
  type AdvertisementProductType,
  type HomepageAdPlacementCode,
  type PaidRecruitmentTier,
} from "./policy";
import { getRotationWindowKey, rotateAdvertisementCandidates } from "./rotation";
import { assertCompanyAdvertisementWriteAccess } from "./service";

export type HomepageAdvertisementListing = {
  payType: "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE" | null;
  payAmount: number | null;
  workType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE" | null;
  originRegionName: string | null;
  destRegionName: string | null;
  regionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
  deadline: Date | null;
};

export type PublicHomepageAdvertisement = {
  /** Synthetic presentation only; never a persisted campaign or billable event. */
  isSample?: boolean;
  imagePosition?: string;
  sampleListingType?: "구인" | "지입";
  id: string;
  advertisementType: AdvertisementProductType;
  placementCode: HomepageAdPlacementCode;
  recruitmentTier: PaidRecruitmentTier | null;
  title: string;
  bannerCopy: string | null;
  imageUrl: string | null;
  linkUrl: string;
  companyId: string;
  companyName: string;
  jobPostId: string | null;
  leasePostId: string | null;
  listing: HomepageAdvertisementListing | null;
};

export type HomepageAdvertisementInventory = {
  main: PublicHomepageAdvertisement[];
  premium: PublicHomepageAdvertisement[];
  general: PublicHomepageAdvertisement[];
  companyLeft: PublicHomepageAdvertisement[];
  companyRight: PublicHomepageAdvertisement[];
};

const EMPTY_LISTING: HomepageAdvertisementListing = {
  payType: null,
  payAmount: null,
  workType: null,
  originRegionName: null,
  destRegionName: null,
  regionName: null,
  vehicleTypeName: null,
  tonnageName: null,
  deadline: null,
};

function requiredText(value: string, code: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(code);
  return normalized;
}

function optionalText(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error("ADVERTISEMENT_FIELD_TOO_LONG");
  return normalized;
}

function validateWindow(startDate: Date, endDate: Date, now: Date): void {
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    Number.isNaN(now.getTime()) ||
    startDate >= endDate ||
    endDate <= now
  ) {
    throw new Error("ADVERTISEMENT_CAMPAIGN_WINDOW_INVALID");
  }
}

async function assertAdmin(actorUserId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") throw new Error("ADMIN_REQUIRED");
}

async function resolveV3ProductAndPlacement(productCode: string, placementCode: string) {
  const contract = getHomepageAdvertisementProductContract(productCode.trim());
  if (!contract) throw new Error("ADVERTISEMENT_PRODUCT_CODE_INVALID");
  const normalizedPlacement = placementCode.trim().toUpperCase() as HomepageAdPlacementCode;
  if (!(contract.allowedPlacements as readonly string[]).includes(normalizedPlacement)) {
    throw new Error("ADVERTISEMENT_PRODUCT_PLACEMENT_MISMATCH");
  }
  const [product, placement] = await Promise.all([
    prisma.product.findUnique({
      where: { code: contract.code },
      select: {
        id: true,
        code: true,
        type: true,
        status: true,
        advertisementType: true,
        recruitmentEntitlement: { select: { recruitmentTier: true } },
      },
    }),
    prisma.adPlacement.findUnique({
      where: { code: normalizedPlacement },
      select: { id: true, code: true, isActive: true },
    }),
  ]);
  if (!product || product.type !== "ADVERTISEMENT" || product.status !== "ACTIVE") {
    throw new Error("ADVERTISEMENT_PRODUCT_INACTIVE");
  }
  if (product.advertisementType !== contract.advertisementType) {
    throw new Error("ADVERTISEMENT_PRODUCT_POLICY_MISMATCH");
  }
  if (!placement?.isActive) throw new Error("ADVERTISEMENT_PLACEMENT_INACTIVE");
  if (
    contract.advertisementType === "RECRUITMENT_LISTING" &&
    product.recruitmentEntitlement?.recruitmentTier !== contract.recruitmentTier
  ) {
    throw new Error("ADVERTISEMENT_PRODUCT_POLICY_MISMATCH");
  }
  return { contract, product, placement };
}

async function assertOwnedPublishableTarget(input: {
  advertisementType: AdvertisementProductType;
  companyId: string;
  jobPostId?: string | null;
  leasePostId?: string | null;
}, db: Pick<typeof prisma, "jobPost" | "leasePost"> = prisma) {
  const jobPostId = optionalText(input.jobPostId, 191);
  const leasePostId = optionalText(input.leasePostId, 191);
  if (input.advertisementType === "COMPANY_BANNER") {
    if (jobPostId || leasePostId) throw new Error("ADVERTISEMENT_BANNER_TARGET_FORBIDDEN");
    return { jobPostId: null, leasePostId: null };
  }
  if (Boolean(jobPostId) === Boolean(leasePostId)) throw new Error("ADVERTISEMENT_LISTING_TARGET_XOR_REQUIRED");
  if (jobPostId) {
    const job = await db.jobPost.findFirst({
      where: {
        id: jobPostId,
        companyId: input.companyId,
        status: "OPEN",
        deletedAt: null,
        publishedAt: { not: null },
      },
      select: { id: true },
    });
    if (!job) throw new Error("ADVERTISEMENT_LISTING_TARGET_INVALID");
  }
  if (leasePostId) {
    const lease = await db.leasePost.findFirst({
      where: {
        id: leasePostId,
        companyId: input.companyId,
        status: "PUBLISHED",
        deletedAt: null,
        publishedAt: { not: null },
      },
      select: { id: true },
    });
    if (!lease) throw new Error("ADVERTISEMENT_LISTING_TARGET_INVALID");
  }
  return { jobPostId, leasePostId };
}

export async function createHomepageAdvertisementCampaign(input: {
  actorUserId: string;
  companyId: string;
  productCode: string;
  placementCode: string;
  jobPostId?: string | null;
  leasePostId?: string | null;
  title: string;
  bannerCopy?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  startDate: Date;
  endDate: Date;
  now?: Date;
}) {
  await assertCompanyAdvertisementWriteAccess({ actorUserId: input.actorUserId, companyId: input.companyId });
  const now = input.now ?? new Date();
  validateWindow(input.startDate, input.endDate, now);
  const { contract, product, placement } = await resolveV3ProductAndPlacement(input.productCode, input.placementCode);
  const target = await assertOwnedPublishableTarget({
    advertisementType: contract.advertisementType,
    companyId: input.companyId,
    jobPostId: input.jobPostId,
    leasePostId: input.leasePostId,
  });
  await assertAdvertisingEntitlementCovers({
    companyId: input.companyId,
    productId: product.id,
    advertisementType: contract.advertisementType,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return prisma.adCampaign.create({
    data: {
      companyId: input.companyId,
      productId: product.id,
      placementId: placement.id,
      advertisementType: contract.advertisementType,
      jobPostId: target.jobPostId,
      leasePostId: target.leasePostId,
      title: requiredText(input.title, "ADVERTISEMENT_TITLE_INVALID", 100),
      bannerCopy: optionalText(input.bannerCopy, 160),
      imageUrl: normalizeAdvertisementUrl(input.imageUrl, "image"),
      linkUrl: contract.advertisementType === "COMPANY_BANNER"
        ? normalizeAdvertisementUrl(input.linkUrl, "link")
        : null,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "PENDING",
    },
    select: { id: true, status: true },
  });
}

export async function listOwnedAdvertisementTargets(input: {
  actorUserId: string;
  companyId: string;
}) {
  await assertCompanyAdvertisementWriteAccess(input);
  const [jobs, leases] = await Promise.all([
    prisma.jobPost.findMany({
      where: { companyId: input.companyId, status: "OPEN", deletedAt: null, publishedAt: { not: null } },
      select: { id: true, title: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
    prisma.leasePost.findMany({
      where: { companyId: input.companyId, status: "PUBLISHED", deletedAt: null, publishedAt: { not: null } },
      select: { id: true, title: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
  ]);
  return { jobs, leases };
}

async function assertCapacity(input: {
  campaignId: string;
  placementCode: HomepageAdPlacementCode;
  tier: PaidRecruitmentTier | null;
  startDate: Date;
  endDate: Date;
}, db: Pick<typeof prisma, "adCampaign"> = prisma) {
  const capacity = input.placementCode === HOMEPAGE_AD_PLACEMENTS.COMPANY_LEFT
    ? HOMEPAGE_AD_INVENTORY_CAPACITY.COMPANY_LEFT
    : input.placementCode === HOMEPAGE_AD_PLACEMENTS.COMPANY_RIGHT
      ? HOMEPAGE_AD_INVENTORY_CAPACITY.COMPANY_RIGHT
      : input.tier
        ? HOMEPAGE_AD_INVENTORY_CAPACITY[input.tier]
        : null;
  if (capacity === null) return;
  const activeCount = await db.adCampaign.count({
    where: {
      id: { not: input.campaignId },
      status: "ACTIVE",
      deletedAt: null,
      startDate: { lt: input.endDate },
      endDate: { gt: input.startDate },
      placement: { code: input.placementCode },
      ...(input.tier
        ? { product: { recruitmentEntitlement: { recruitmentTier: input.tier } } }
        : {}),
    },
  });
  if (activeCount >= capacity) throw new Error("ADVERTISEMENT_INVENTORY_CAPACITY_EXCEEDED");
}

export async function setHomepageAdvertisementCampaignStatusByAdmin(input: {
  actorUserId: string;
  campaignId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  now?: Date;
}) {
  await assertAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.adCampaign.findUnique({
      where: { id: input.campaignId },
      select: {
        id: true,
        status: true,
        companyId: true,
        productId: true,
        advertisementType: true,
        jobPostId: true,
        leasePostId: true,
        startDate: true,
        endDate: true,
        deletedAt: true,
        product: {
          select: {
            code: true,
            status: true,
            advertisementType: true,
            recruitmentEntitlement: { select: { recruitmentTier: true } },
          },
        },
        placement: { select: { code: true, isActive: true } },
        company: { select: { status: true, deletedAt: true } },
      },
    });
    if (!current || current.deletedAt || !current.advertisementType) {
      throw new Error("ADVERTISEMENT_CAMPAIGN_NOT_FOUND");
    }
    if (input.status === "ACTIVE") {
      if (current.status !== "PENDING" && current.status !== "PAUSED") {
        throw new Error("ADVERTISEMENT_CAMPAIGN_TRANSITION_INVALID");
      }
      if (!current.companyId || current.company?.status !== "ACTIVE" || current.company.deletedAt) {
        throw new Error("COMPANY_INACTIVE");
      }
      if (!current.productId || !current.product?.code || current.product.status !== "ACTIVE") {
        throw new Error("ADVERTISEMENT_PRODUCT_INACTIVE");
      }
      const contract = getHomepageAdvertisementProductContract(current.product.code);
      if (
        !contract ||
        contract.advertisementType !== current.advertisementType ||
        current.product.advertisementType !== current.advertisementType ||
        !(contract.allowedPlacements as readonly string[]).includes(current.placement.code) ||
        !current.placement.isActive
      ) {
        throw new Error("ADVERTISEMENT_PRODUCT_PLACEMENT_MISMATCH");
      }
      validateWindow(current.startDate, current.endDate, now);
      await assertOwnedPublishableTarget({
        advertisementType: current.advertisementType,
        companyId: current.companyId,
        jobPostId: current.jobPostId,
        leasePostId: current.leasePostId,
      }, tx);
      await assertAdvertisingEntitlementCovers({
        companyId: current.companyId,
        productId: current.productId,
        advertisementType: current.advertisementType,
        startDate: current.startDate,
        endDate: current.endDate,
      }, tx);
      await assertCapacity({
        campaignId: current.id,
        placementCode: current.placement.code as HomepageAdPlacementCode,
        tier: current.product.recruitmentEntitlement?.recruitmentTier ?? null,
        startDate: current.startDate,
        endDate: current.endDate,
      }, tx);
    } else if (input.status === "PAUSED") {
      if (current.status !== "ACTIVE") throw new Error("ADVERTISEMENT_CAMPAIGN_TRANSITION_INVALID");
    } else if (current.status === "CANCELLED" || current.status === "EXPIRED") {
      throw new Error("ADVERTISEMENT_CAMPAIGN_TRANSITION_INVALID");
    }
    const updated = await tx.adCampaign.updateMany({
      where: { id: current.id, status: current.status, deletedAt: null },
      data: { status: input.status },
    });
    if (updated.count !== 1) throw new Error("ADVERTISEMENT_CAMPAIGN_TRANSITION_CONFLICT");
    await tx.adminLog.create({
      data: {
        adminId: input.actorUserId,
        action: `HOMEPAGE_ADVERTISEMENT_CAMPAIGN_${input.status}`,
        targetType: "AdCampaign",
        targetId: current.id,
      },
    });
    return { id: current.id, status: input.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function syncHomepageAdvertisementCatalogV3(input: { actorUserId: string }) {
  await assertAdmin(input.actorUserId);
  return prisma.$transaction(async (tx) => {
    for (const policy of Object.values(ADVERTISEMENT_PRODUCT_CATALOG)) {
      await tx.product.updateMany({
        where: { code: policy.code },
        data: { advertisementType: "RECRUITMENT_LISTING" },
      });
    }
    await tx.product.upsert({
      where: { code: COMPANY_BANNER_PRODUCT.code },
      create: {
        code: COMPANY_BANNER_PRODUCT.code,
        name: COMPANY_BANNER_PRODUCT.displayName,
        type: "ADVERTISEMENT",
        advertisementType: "COMPANY_BANNER",
        price: COMPANY_BANNER_PRODUCT.priceKrw,
        status: "ACTIVE",
      },
      update: {
        name: COMPANY_BANNER_PRODUCT.displayName,
        type: "ADVERTISEMENT",
        advertisementType: "COMPANY_BANNER",
        price: COMPANY_BANNER_PRODUCT.priceKrw,
      },
    });
    const placements = [
      [HOMEPAGE_AD_PLACEMENTS.RECRUITMENT, "홈 채용·지입 광고"],
      [HOMEPAGE_AD_PLACEMENTS.COMPANY_LEFT, "홈 왼쪽 기업 배너"],
      [HOMEPAGE_AD_PLACEMENTS.COMPANY_RIGHT, "홈 오른쪽 기업 배너"],
    ] as const;
    for (const [code, name] of placements) {
      await tx.adPlacement.upsert({
        where: { code },
        create: { code, name, isActive: true },
        update: { name },
      });
    }
    await tx.adminLog.create({
      data: {
        adminId: input.actorUserId,
        action: "HOMEPAGE_ADVERTISEMENT_CATALOG_V3_SYNCED",
        targetType: "Product",
        metadata: { companyBannerCode: COMPANY_BANNER_PRODUCT.code, placements: placements.map(([code]) => code) },
      },
    });
    return { productCode: COMPANY_BANNER_PRODUCT.code, placements: placements.map(([code]) => code) };
  });
}

function safeUrl(value: string | null, kind: "link" | "image"): string | null {
  try {
    return normalizeAdvertisementUrl(value, kind);
  } catch {
    return null;
  }
}

export async function listHomepageAdvertisementInventory(input: {
  regionId?: string | null;
  now?: Date;
  windowKey?: number;
} = {}): Promise<HomepageAdvertisementInventory> {
  const now = input.now ?? new Date();
  const windowKey = input.windowKey ?? getRotationWindowKey(now);
  const rows = await prisma.adCampaign.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      startDate: { lte: now },
      endDate: { gt: now },
      advertisementType: { not: null },
      placement: { code: { in: Object.values(HOMEPAGE_AD_PLACEMENTS) }, isActive: true },
      company: { status: "ACTIVE", deletedAt: null },
      product: { type: "ADVERTISEMENT", status: "ACTIVE", advertisementType: { not: null } },
      ...(input.regionId
        ? { OR: [{ regionId: null }, { regionId: input.regionId }] }
        : { regionId: null }),
    },
    select: {
      id: true,
      companyId: true,
      productId: true,
      advertisementType: true,
      jobPostId: true,
      leasePostId: true,
      title: true,
      bannerCopy: true,
      imageUrl: true,
      linkUrl: true,
      company: { select: { id: true, name: true, status: true, deletedAt: true } },
      placement: { select: { code: true, isActive: true } },
      product: {
        select: {
          code: true,
          advertisementType: true,
          recruitmentEntitlement: { select: { recruitmentTier: true } },
        },
      },
      jobPost: {
        select: {
          id: true,
          companyId: true,
          status: true,
          deletedAt: true,
          publishedAt: true,
          payType: true,
          payAmount: true,
          workType: true,
          deadline: true,
          originRegion: { select: { name: true } },
          destRegion: { select: { name: true } },
          vehicleType: { select: { name: true } },
          tonnage: { select: { name: true } },
        },
      },
      leasePost: {
        select: {
          id: true,
          companyId: true,
          status: true,
          deletedAt: true,
          publishedAt: true,
          payType: true,
          payAmount: true,
          workType: true,
          region: { select: { name: true } },
          vehicleType: { select: { name: true } },
          tonnage: { select: { name: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const pairs = rows.flatMap((row) => row.companyId && row.productId
    ? [{ companyId: row.companyId, productId: row.productId }]
    : []);
  const entitlements = pairs.length
    ? await prisma.companyAdvertisementEntitlement.findMany({
        where: {
          cancelledAt: null,
          validFrom: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          companyId: { in: [...new Set(pairs.map((pair) => pair.companyId))] },
          productId: { in: [...new Set(pairs.map((pair) => pair.productId))] },
        },
        select: { companyId: true, productId: true },
      })
    : [];
  const activePairs = new Set(entitlements.map((item) => `${item.companyId}:${item.productId}`));

  const eligible: PublicHomepageAdvertisement[] = [];
  for (const row of rows) {
    if (!row.companyId || !row.productId || !row.company || !row.advertisementType || !row.product?.code) continue;
    if (!activePairs.has(`${row.companyId}:${row.productId}`)) continue;
    const contract = getHomepageAdvertisementProductContract(row.product.code);
    const placementCode = row.placement.code as HomepageAdPlacementCode;
    if (
      !contract ||
      contract.advertisementType !== row.advertisementType ||
      row.product.advertisementType !== row.advertisementType ||
      !(contract.allowedPlacements as readonly string[]).includes(placementCode)
    ) continue;

    let listing: HomepageAdvertisementListing | null = null;
    let linkUrl: string;
    if (row.advertisementType === "RECRUITMENT_LISTING") {
      if (Boolean(row.jobPostId) === Boolean(row.leasePostId)) continue;
      if (row.jobPostId) {
        const job = row.jobPost;
        if (!job || job.companyId !== row.companyId || job.status !== "OPEN" || job.deletedAt || !job.publishedAt) continue;
        listing = {
          ...EMPTY_LISTING,
          payType: job.payType,
          payAmount: job.payAmount,
          workType: job.workType,
          deadline: job.deadline,
          originRegionName: job.originRegion?.name ?? null,
          destRegionName: job.destRegion?.name ?? null,
          vehicleTypeName: job.vehicleType?.name ?? null,
          tonnageName: job.tonnage?.name ?? null,
        };
        linkUrl = publicJobHref(job.id);
      } else {
        const lease = row.leasePost;
        if (!lease || lease.companyId !== row.companyId || lease.status !== "PUBLISHED" || lease.deletedAt || !lease.publishedAt) continue;
        listing = {
          ...EMPTY_LISTING,
          payType: lease.payType,
          payAmount: lease.payAmount,
          workType: lease.workType,
          regionName: lease.region?.name ?? null,
          vehicleTypeName: lease.vehicleType?.name ?? null,
          tonnageName: lease.tonnage?.name ?? null,
        };
        linkUrl = publicLeaseHref(lease.id);
      }
    } else {
      if (row.jobPostId || row.leasePostId) continue;
      linkUrl = publicCompanyHref(row.company.id);
    }

    eligible.push({
      id: row.id,
      advertisementType: row.advertisementType,
      placementCode,
      recruitmentTier: row.product.recruitmentEntitlement?.recruitmentTier ?? null,
      title: row.title,
      bannerCopy: row.bannerCopy,
      imageUrl: safeUrl(row.imageUrl, "image"),
      linkUrl,
      companyId: row.company.id,
      companyName: row.company.name,
      jobPostId: row.jobPostId,
      leasePostId: row.leasePostId,
      listing,
    });
  }

  const paidTargetSeen = new Set<string>();
  const recruitment = eligible
    .filter((item) => item.advertisementType === "RECRUITMENT_LISTING" && item.recruitmentTier)
    .sort((left, right) => {
      const priority = { MAIN: 3, PREMIUM: 2, GENERAL: 1 } as const;
      return priority[right.recruitmentTier!] - priority[left.recruitmentTier!] || left.id.localeCompare(right.id);
    })
    .filter((item) => {
      const key = item.jobPostId ? `job:${item.jobPostId}` : `lease:${item.leasePostId}`;
      if (paidTargetSeen.has(key)) return false;
      paidTargetSeen.add(key);
      return true;
    });
  const group = (tier: PaidRecruitmentTier, visibleSlots: number) => rotateAdvertisementCandidates({
    candidates: recruitment.filter((item) => item.recruitmentTier === tier),
    visibleSlots,
    windowKey,
    groupKey: `homepage:${tier}`,
  });
  const bannerGroup = (placementCode: HomepageAdPlacementCode, visibleSlots: number) => rotateAdvertisementCandidates({
    candidates: eligible.filter((item) => item.advertisementType === "COMPANY_BANNER" && item.placementCode === placementCode),
    visibleSlots,
    windowKey,
    groupKey: `homepage:${placementCode}`,
  });
  return {
    main: group("MAIN", HOMEPAGE_AD_INVENTORY_CAPACITY.MAIN),
    premium: group("PREMIUM", HOMEPAGE_AD_INVENTORY_CAPACITY.PREMIUM),
    general: group("GENERAL", HOMEPAGE_AD_INVENTORY_CAPACITY.GENERAL),
    companyLeft: bannerGroup(HOMEPAGE_AD_PLACEMENTS.COMPANY_LEFT, HOMEPAGE_AD_INVENTORY_CAPACITY.COMPANY_LEFT),
    companyRight: bannerGroup(HOMEPAGE_AD_PLACEMENTS.COMPANY_RIGHT, HOMEPAGE_AD_INVENTORY_CAPACITY.COMPANY_RIGHT),
  };
}
