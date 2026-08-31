import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getHomepageAdvertisementProductContract,
  type AdvertisementProductType,
} from "./policy";

type GrantSource = "ADMIN" | "SYSTEM" | "LEGACY_BACKFILL";

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

async function assertAdmin(actorUserId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") {
    throw new Error("ADMIN_REQUIRED");
  }
}

async function resolveProduct(code: string) {
  const contract = getHomepageAdvertisementProductContract(code);
  if (!contract) throw new Error("ADVERTISEMENT_PRODUCT_CODE_INVALID");
  const product = await prisma.product.findUnique({
    where: { code: contract.code },
    select: { id: true, code: true, status: true, type: true, advertisementType: true },
  });
  if (!product || product.status !== "ACTIVE" || product.type !== "ADVERTISEMENT") {
    throw new Error("ADVERTISEMENT_PRODUCT_INACTIVE");
  }
  if (product.advertisementType !== contract.advertisementType) {
    throw new Error("ADVERTISEMENT_PRODUCT_POLICY_MISMATCH");
  }
  return { product, contract };
}

export async function grantCompanyAdvertisingEntitlement(input: {
  actorUserId?: string;
  companyId: string;
  productCode: string;
  source: GrantSource;
  sourceReference: string;
  idempotencyKey: string;
  now?: Date;
}) {
  const companyId = required(input.companyId, "COMPANY_ID_REQUIRED");
  const sourceReference = required(input.sourceReference, "SOURCE_REFERENCE_REQUIRED");
  const idempotencyKey = required(input.idempotencyKey, "IDEMPOTENCY_KEY_REQUIRED");
  if (input.source === "ADMIN") await assertAdmin(required(input.actorUserId ?? "", "ADMIN_REQUIRED"));
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { status: true, deletedAt: true },
  });
  if (!company || company.status !== "ACTIVE" || company.deletedAt) throw new Error("COMPANY_INACTIVE");

  const { product, contract } = await resolveProduct(input.productCode.trim());
  const validFrom = input.now ?? new Date();
  if (Number.isNaN(validFrom.getTime())) throw new Error("INVALID_GRANT_TIME");
  const expiresAt = addDays(validFrom, contract.durationDays);
  const source = `ADVERTISEMENT_${input.source}_GRANT`;

  const existing = await prisma.companyAdvertisementEntitlement.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      companyId: true,
      productId: true,
      source: true,
      sourceReference: true,
      validFrom: true,
      expiresAt: true,
    },
  });
  if (existing) {
    if (
      existing.companyId !== companyId ||
      existing.productId !== product.id ||
      existing.source !== source ||
      existing.sourceReference !== sourceReference
    ) {
      throw new Error("ADVERTISEMENT_ENTITLEMENT_IDEMPOTENCY_CONFLICT");
    }
    return { ...existing, productCode: contract.code, alreadyGranted: true };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.companyAdvertisementEntitlement.create({
        data: {
          companyId,
          productId: product.id,
          validFrom,
          expiresAt,
          source,
          sourceReference,
          idempotencyKey,
        },
        select: { id: true, companyId: true, productId: true, validFrom: true, expiresAt: true },
      });
      if (input.source === "ADMIN" && input.actorUserId) {
        await tx.adminLog.create({
          data: {
            adminId: input.actorUserId,
            action: "COMPANY_ADVERTISEMENT_ENTITLEMENT_GRANTED",
            targetType: "CompanyAdvertisementEntitlement",
            targetId: created.id,
            metadata: { companyId, productCode: contract.code, advertisementType: contract.advertisementType },
          },
        });
      }
      return { ...created, productCode: contract.code, alreadyGranted: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const replay = await prisma.companyAdvertisementEntitlement.findUnique({
      where: { idempotencyKey },
      select: { id: true, companyId: true, productId: true, validFrom: true, expiresAt: true },
    });
    if (!replay || replay.companyId !== companyId || replay.productId !== product.id) throw error;
    return { ...replay, productCode: contract.code, alreadyGranted: true };
  }
}

export async function listActiveCompanyAdvertisingEntitlements(input: {
  companyId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.companyAdvertisementEntitlement.findMany({
    where: {
      companyId: input.companyId,
      cancelledAt: null,
      validFrom: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      product: { type: "ADVERTISEMENT", status: "ACTIVE", advertisementType: { not: null } },
    },
    select: {
      id: true,
      validFrom: true,
      expiresAt: true,
      product: { select: { id: true, code: true, name: true, advertisementType: true } },
    },
    orderBy: { validFrom: "desc" },
  });
}

export async function assertAdvertisingEntitlementCovers(input: {
  companyId: string;
  productId: string;
  advertisementType: AdvertisementProductType;
  startDate: Date;
  endDate: Date;
}, db: Pick<typeof prisma, "companyAdvertisementEntitlement"> = prisma) {
  const entitlement = await db.companyAdvertisementEntitlement.findFirst({
    where: {
      companyId: input.companyId,
      productId: input.productId,
      cancelledAt: null,
      validFrom: { lte: input.startDate },
      OR: [{ expiresAt: null }, { expiresAt: { gte: input.endDate } }],
      product: { advertisementType: input.advertisementType, status: "ACTIVE" },
    },
    select: { id: true },
    orderBy: { validFrom: "desc" },
  });
  if (!entitlement) throw new Error("ADVERTISEMENT_CAMPAIGN_ENTITLEMENT_INVALID");
  return entitlement;
}

export async function cancelCompanyAdvertisingEntitlement(input: {
  actorUserId: string;
  entitlementId: string;
  reason?: string | null;
  now?: Date;
}) {
  await assertAdmin(input.actorUserId);
  const entitlementId = required(input.entitlementId, "ADVERTISEMENT_ENTITLEMENT_ID_REQUIRED");
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > 300) throw new Error("ADVERTISEMENT_ENTITLEMENT_CANCEL_REASON_TOO_LONG");
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.companyAdvertisementEntitlement.findUnique({
      where: { id: entitlementId },
      select: { id: true, companyId: true, cancelledAt: true, expiresAt: true, productId: true },
    });
    if (!current) throw new Error("ADVERTISEMENT_ENTITLEMENT_NOT_FOUND");
    if (current.cancelledAt) return { ...current, alreadyCancelled: true };
    const updated = await tx.companyAdvertisementEntitlement.updateMany({
      where: { id: current.id, cancelledAt: null },
      data: { cancelledAt: now, cancelReason: reason },
    });
    if (updated.count !== 1) throw new Error("ADVERTISEMENT_ENTITLEMENT_CANCEL_CONFLICT");
    await tx.adminLog.create({
      data: {
        adminId: input.actorUserId,
        action: "COMPANY_ADVERTISEMENT_ENTITLEMENT_CANCELLED",
        targetType: "CompanyAdvertisementEntitlement",
        targetId: current.id,
        metadata: { companyId: current.companyId, productId: current.productId, reason },
      },
    });
    return { ...current, cancelledAt: now, alreadyCancelled: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
