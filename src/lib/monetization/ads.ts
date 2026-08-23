import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  ADVERTISEMENT_PRODUCT_CATALOG,
  getAdvertisementProductPolicy,
  type ManagedAdvertisementProductCode,
} from "./policy";
import {
  assertCompanyAdvertisementWriteAccess,
  getManagedAdvertisementProductByCode,
  listActiveCompanyAdvertisementEntitlements,
} from "./service";

const MAX_PUBLIC_ADS = 10;

function requiredText(value: string, errorCode: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(errorCode);
  return normalized;
}

function optionalText(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error("ADVERTISEMENT_FIELD_TOO_LONG");
  return normalized;
}

export function normalizeAdvertisementUrl(
  value: string | null | undefined,
  kind: "link" | "image",
): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > 2_000) throw new Error("ADVERTISEMENT_URL_TOO_LONG");

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(kind === "image" ? "ADVERTISEMENT_IMAGE_URL_INVALID" : "ADVERTISEMENT_LINK_URL_INVALID");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(kind === "image" ? "ADVERTISEMENT_IMAGE_URL_INVALID" : "ADVERTISEMENT_LINK_URL_INVALID");
  }
  return parsed.toString();
}

function safeStoredUrl(value: string | null, kind: "link" | "image"): string | null {
  try {
    return normalizeAdvertisementUrl(value, kind);
  } catch {
    return null;
  }
}

function validateCampaignWindow(startDate: Date, endDate: Date, now: Date): void {
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

async function assertActiveAdmin(actorUserId: string): Promise<void> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, status: true },
  });
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") throw new Error("ADMIN_REQUIRED");
}

async function assertRegionActive(regionId: string | null): Promise<void> {
  if (!regionId) return;
  const region = await prisma.region.findUnique({
    where: { id: regionId },
    select: { id: true, isActive: true },
  });
  if (!region || !region.isActive) throw new Error("ADVERTISEMENT_REGION_INVALID");
}

async function resolvePlacement(code: string) {
  const placementCode = requiredText(code, "ADVERTISEMENT_PLACEMENT_CODE_INVALID", 40).toUpperCase();
  const placement = await prisma.adPlacement.findUnique({
    where: { code: placementCode },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!placement || !placement.isActive) throw new Error("ADVERTISEMENT_PLACEMENT_INACTIVE");
  return placement;
}

async function assertEntitlementCoversCampaign(input: {
  companyId: string;
  productEntitlementId: string;
  startDate: Date;
  endDate: Date;
}) {
  const entitlement = await prisma.companyRecruitmentEntitlement.findFirst({
    where: {
      companyId: input.companyId,
      productEntitlementId: input.productEntitlementId,
      validFrom: { lte: input.startDate },
      OR: [{ expiresAt: null }, { expiresAt: { gte: input.endDate } }],
    },
    select: { id: true, recruitmentTier: true, validFrom: true, expiresAt: true },
    orderBy: { validFrom: "desc" },
  });
  if (!entitlement) throw new Error("ADVERTISEMENT_CAMPAIGN_ENTITLEMENT_INVALID");
  return entitlement;
}

export async function createCompanyAdvertisementCampaign(input: {
  actorUserId: string;
  companyId: string;
  productCode: string;
  placementCode: string;
  regionId?: string | null;
  title: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
  startDate: Date;
  endDate: Date;
  now?: Date;
}) {
  await assertCompanyAdvertisementWriteAccess({ actorUserId: input.actorUserId, companyId: input.companyId });
  const now = input.now ?? new Date();
  validateCampaignWindow(input.startDate, input.endDate, now);
  const title = requiredText(input.title, "ADVERTISEMENT_TITLE_INVALID", 100);
  const imageUrl = normalizeAdvertisementUrl(input.imageUrl, "image");
  const linkUrl = normalizeAdvertisementUrl(input.linkUrl, "link");
  const regionId = optionalText(input.regionId, 191);
  await assertRegionActive(regionId);

  const product = await getManagedAdvertisementProductByCode(input.productCode);
  const placement = await resolvePlacement(input.placementCode);
  await assertEntitlementCoversCampaign({
    companyId: input.companyId,
    productEntitlementId: product.productEntitlementId,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return prisma.adCampaign.create({
    data: {
      companyId: input.companyId,
      productId: product.productId,
      placementId: placement.id,
      regionId,
      title,
      imageUrl,
      linkUrl,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "PENDING",
    },
    select: { id: true, status: true, startDate: true, endDate: true },
  });
}

export async function updateCompanyAdvertisementCampaign(input: {
  actorUserId: string;
  companyId: string;
  campaignId: string;
  productCode: string;
  placementCode: string;
  regionId?: string | null;
  title: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
  startDate: Date;
  endDate: Date;
  now?: Date;
}) {
  await assertCompanyAdvertisementWriteAccess({ actorUserId: input.actorUserId, companyId: input.companyId });
  const current = await prisma.adCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, companyId: true, status: true },
  });
  if (!current || current.companyId !== input.companyId) throw new Error("ADVERTISEMENT_CAMPAIGN_NOT_FOUND");
  if (current.status !== "PENDING" && current.status !== "PAUSED") {
    throw new Error("ADVERTISEMENT_CAMPAIGN_NOT_EDITABLE");
  }

  const now = input.now ?? new Date();
  validateCampaignWindow(input.startDate, input.endDate, now);
  const product = await getManagedAdvertisementProductByCode(input.productCode);
  const placement = await resolvePlacement(input.placementCode);
  const regionId = optionalText(input.regionId, 191);
  await assertRegionActive(regionId);
  await assertEntitlementCoversCampaign({
    companyId: input.companyId,
    productEntitlementId: product.productEntitlementId,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return prisma.adCampaign.update({
    where: { id: current.id },
    data: {
      productId: product.productId,
      placementId: placement.id,
      regionId,
      title: requiredText(input.title, "ADVERTISEMENT_TITLE_INVALID", 100),
      imageUrl: normalizeAdvertisementUrl(input.imageUrl, "image"),
      linkUrl: normalizeAdvertisementUrl(input.linkUrl, "link"),
      startDate: input.startDate,
      endDate: input.endDate,
      status: "PENDING",
    },
    select: { id: true, status: true, startDate: true, endDate: true },
  });
}

export async function setAdvertisementCampaignStatusByAdmin(input: {
  actorUserId: string;
  campaignId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  now?: Date;
}) {
  await assertActiveAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.adCampaign.findUnique({
      where: { id: input.campaignId },
      select: {
        id: true,
        status: true,
        companyId: true,
        productId: true,
        startDate: true,
        endDate: true,
        deletedAt: true,
        company: { select: { status: true } },
        product: {
          select: {
            code: true,
            type: true,
            status: true,
            recruitmentEntitlement: { select: { id: true } },
          },
        },
        placement: { select: { isActive: true } },
      },
    });
    if (!current || current.deletedAt) throw new Error("ADVERTISEMENT_CAMPAIGN_NOT_FOUND");

    if (input.status === "ACTIVE") {
      if (current.status !== "PENDING" && current.status !== "PAUSED") {
        throw new Error("ADVERTISEMENT_CAMPAIGN_TRANSITION_INVALID");
      }
      if (!current.companyId || current.company?.status !== "ACTIVE") throw new Error("COMPANY_INACTIVE");
      if (!current.productId || !current.product?.code || current.product.type !== "ADVERTISEMENT" || current.product.status !== "ACTIVE") {
        throw new Error("ADVERTISEMENT_PRODUCT_INACTIVE");
      }
      if (!getAdvertisementProductPolicy(current.product.code)) throw new Error("ADVERTISEMENT_PRODUCT_CODE_INVALID");
      if (!current.product.recruitmentEntitlement) throw new Error("ADVERTISEMENT_PRODUCT_ENTITLEMENT_MISSING");
      if (!current.placement.isActive) throw new Error("ADVERTISEMENT_PLACEMENT_INACTIVE");
      validateCampaignWindow(current.startDate, current.endDate, now);
      const entitlement = await tx.companyRecruitmentEntitlement.findFirst({
        where: {
          companyId: current.companyId,
          productEntitlementId: current.product.recruitmentEntitlement.id,
          validFrom: { lte: current.startDate },
          OR: [{ expiresAt: null }, { expiresAt: { gte: current.endDate } }],
        },
        select: { id: true },
        orderBy: { validFrom: "desc" },
      });
      if (!entitlement) throw new Error("ADVERTISEMENT_CAMPAIGN_ENTITLEMENT_INVALID");
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
        action: `ADVERTISEMENT_CAMPAIGN_${input.status}`,
        targetType: "AdCampaign",
        targetId: current.id,
      },
    });
    return { id: current.id, status: input.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function expireAdvertisementCampaignsByAdmin(input: {
  actorUserId: string;
  now?: Date;
}) {
  await assertActiveAdmin(input.actorUserId);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("ADVERTISEMENT_CAMPAIGN_WINDOW_INVALID");
  const result = await prisma.adCampaign.updateMany({
    where: {
      deletedAt: null,
      endDate: { lte: now },
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
    data: { status: "EXPIRED" },
  });
  return { expiredCount: result.count };
}

export async function syncManagedAdvertisementCatalog(input: { actorUserId: string }) {
  await assertActiveAdmin(input.actorUserId);
  return prisma.$transaction(async (tx) => {
    const synced: string[] = [];
    for (const policy of Object.values(ADVERTISEMENT_PRODUCT_CATALOG)) {
      const product = await tx.product.upsert({
        where: { code: policy.code },
        create: {
          code: policy.code,
          name: policy.displayName,
          type: "ADVERTISEMENT",
          price: policy.priceKrw,
          status: "ACTIVE",
        },
        update: {
          name: policy.displayName,
          type: "ADVERTISEMENT",
          price: policy.priceKrw,
          status: "ACTIVE",
        },
        select: { id: true, code: true },
      });
      await tx.productRecruitmentEntitlement.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          recruitmentTier: policy.recruitmentTier,
          weeklyMatchQuota: policy.weeklyMatchQuota,
        },
        update: {
          recruitmentTier: policy.recruitmentTier,
          weeklyMatchQuota: policy.weeklyMatchQuota,
        },
      });
      synced.push(policy.code);
    }
    await tx.adminLog.create({
      data: {
        adminId: input.actorUserId,
        action: "ADVERTISEMENT_CATALOG_SYNCED",
        targetType: "Product",
        metadata: { productCodes: synced },
      },
    });
    return synced;
  });
}

export async function upsertAdvertisementPlacementByAdmin(input: {
  actorUserId: string;
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}) {
  await assertActiveAdmin(input.actorUserId);
  const code = requiredText(input.code, "ADVERTISEMENT_PLACEMENT_CODE_INVALID", 40).toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(code)) throw new Error("ADVERTISEMENT_PLACEMENT_CODE_INVALID");
  const name = requiredText(input.name, "ADVERTISEMENT_PLACEMENT_NAME_INVALID", 80);
  const description = optionalText(input.description, 300);
  const placement = await prisma.adPlacement.upsert({
    where: { code },
    create: { code, name, description, isActive: input.isActive ?? true },
    update: { name, description, isActive: input.isActive ?? true },
    select: { id: true, code: true, name: true, isActive: true },
  });
  await prisma.adminLog.create({
    data: {
      adminId: input.actorUserId,
      action: "ADVERTISEMENT_PLACEMENT_UPSERTED",
      targetType: "AdPlacement",
      targetId: placement.id,
      metadata: { code: placement.code, isActive: placement.isActive },
    },
  });
  return placement;
}

export async function listPublicAdvertisementCampaigns(input: {
  placementCode: string;
  regionId?: string | null;
  now?: Date;
  limit?: number;
}) {
  const placementCode = input.placementCode.trim().toUpperCase();
  if (!placementCode) return [];
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(MAX_PUBLIC_ADS, input.limit ?? 3));
  const rows = await prisma.adCampaign.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      startDate: { lte: now },
      endDate: { gt: now },
      placement: { code: placementCode, isActive: true },
      company: { status: "ACTIVE" },
      product: { type: "ADVERTISEMENT", status: "ACTIVE" },
      ...(input.regionId
        ? { OR: [{ regionId: null }, { regionId: input.regionId }] }
        : { regionId: null }),
    },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      linkUrl: true,
      sortOrder: true,
      company: { select: { name: true } },
    },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    imageUrl: safeStoredUrl(row.imageUrl, "image"),
    linkUrl: safeStoredUrl(row.linkUrl, "link"),
    companyName: row.company?.name ?? null,
  }));
}

export async function listCompanyAdvertisementCampaigns(input: {
  actorUserId: string;
  companyId: string;
}) {
  await listActiveCompanyAdvertisementEntitlements({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
  });
  return prisma.adCampaign.findMany({
    where: { companyId: input.companyId, deletedAt: null },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      linkUrl: true,
      startDate: true,
      endDate: true,
      status: true,
      regionId: true,
      product: { select: { code: true, name: true } },
      placement: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listActiveAdvertisementPlacementsForCompany(input: {
  actorUserId: string;
  companyId: string;
}) {
  await listActiveCompanyAdvertisementEntitlements({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
  });
  return prisma.adPlacement.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, description: true },
    orderBy: { code: "asc" },
  });
}

export async function getAdminAdvertisementOperations(actorUserId: string) {
  await assertActiveAdmin(actorUserId);
  const [products, placements, campaigns, entitlements, companies] = await Promise.all([
    prisma.product.findMany({
      where: { type: "ADVERTISEMENT" },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        status: true,
        recruitmentEntitlement: { select: { recruitmentTier: true, weeklyMatchQuota: true } },
      },
      orderBy: { price: "asc" },
    }),
    prisma.adPlacement.findMany({ orderBy: { code: "asc" } }),
    prisma.adCampaign.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        company: { select: { id: true, name: true } },
        product: { select: { code: true, name: true } },
        placement: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.companyRecruitmentEntitlement.findMany({
      select: {
        id: true,
        recruitmentTier: true,
        validFrom: true,
        expiresAt: true,
        source: true,
        company: { select: { id: true, name: true } },
        productEntitlement: { select: { product: { select: { code: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.company.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);
  return { products, placements, campaigns, entitlements, companies };
}

export type AdvertisementCampaignAdminStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
export type AdvertisementProductCode = ManagedAdvertisementProductCode;