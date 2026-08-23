import { prisma } from "@/lib/prisma";
import {
  ADVERTISEMENT_PRODUCT_CATALOG,
  getAdvertisementProductPolicy,
  type ManagedAdvertisementProductCode,
  type PaidRecruitmentTier,
} from "./policy";

export type ManagedAdvertisementProduct = {
  productId: string;
  code: ManagedAdvertisementProductCode;
  displayName: string;
  priceKrw: number;
  durationDays: number;
  recruitmentTier: PaidRecruitmentTier;
  weeklyMatchQuota: number;
  productEntitlementId: string;
};

export async function getManagedAdvertisementProductByCode(
  rawCode: string,
): Promise<ManagedAdvertisementProduct> {
  const code = rawCode.trim();
  const policy = getAdvertisementProductPolicy(code);
  if (!policy) throw new Error("ADVERTISEMENT_PRODUCT_CODE_INVALID");

  const product = await prisma.product.findUnique({
    where: { code: policy.code },
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      type: true,
      status: true,
      recruitmentEntitlement: {
        select: {
          id: true,
          recruitmentTier: true,
          weeklyMatchQuota: true,
        },
      },
    },
  });

  if (!product) throw new Error("ADVERTISEMENT_PRODUCT_NOT_FOUND");
  if (product.type !== "ADVERTISEMENT") throw new Error("ADVERTISEMENT_PRODUCT_TYPE_INVALID");
  if (product.status !== "ACTIVE") throw new Error("ADVERTISEMENT_PRODUCT_INACTIVE");
  if (product.code !== policy.code) throw new Error("ADVERTISEMENT_PRODUCT_CODE_MISMATCH");
  if (!product.recruitmentEntitlement) throw new Error("ADVERTISEMENT_PRODUCT_ENTITLEMENT_MISSING");

  const entitlement = product.recruitmentEntitlement;
  if (
    product.price !== policy.priceKrw ||
    entitlement.recruitmentTier !== policy.recruitmentTier ||
    entitlement.weeklyMatchQuota !== policy.weeklyMatchQuota
  ) {
    throw new Error("ADVERTISEMENT_PRODUCT_POLICY_MISMATCH");
  }

  return {
    productId: product.id,
    code: product.code as ManagedAdvertisementProductCode,
    displayName: product.name,
    priceKrw: product.price,
    durationDays: policy.durationDays,
    recruitmentTier: entitlement.recruitmentTier,
    weeklyMatchQuota: entitlement.weeklyMatchQuota,
    productEntitlementId: entitlement.id,
  };
}

type AdvertisementEntitlementGrantSource = "ADMIN" | "SYSTEM";

const ENTITLEMENT_SOURCE: Record<AdvertisementEntitlementGrantSource, string> = {
  ADMIN: "ADVERTISEMENT_ADMIN_GRANT",
  SYSTEM: "ADVERTISEMENT_SYSTEM_GRANT",
};

export type AdvertisementEntitlementGrantResult = {
  entitlementId: string;
  companyId: string;
  productCode: ManagedAdvertisementProductCode;
  recruitmentTier: PaidRecruitmentTier;
  validFrom: Date;
  expiresAt: Date;
  alreadyGranted: boolean;
};

function normalizeRequiredToken(value: string, errorCode: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(errorCode);
  return normalized;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

async function assertActiveAdmin(actorUserId: string): Promise<void> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, status: true },
  });
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    throw new Error("ADMIN_REQUIRED");
  }
}

async function assertActiveCompany(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, status: true },
  });
  if (!company || company.status !== "ACTIVE") throw new Error("COMPANY_INACTIVE");
}

async function assertCompanyMembershipAccess(input: {
  actorUserId: string;
  companyId: string;
  allowedRoles: Array<"OWNER" | "MANAGER" | "STAFF">;
}) {
  const [user, company, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { id: true, role: true, status: true },
    }),
    prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, status: true },
    }),
    prisma.companyMember.findUnique({
      where: { userId_companyId: { userId: input.actorUserId, companyId: input.companyId } },
      select: { role: true, status: true },
    }),
  ]);
  if (!user || user.status !== "ACTIVE") throw new Error("USER_INACTIVE");
  if (user.role !== "COMPANY") throw new Error("COMPANY_USER_REQUIRED");
  if (!company || company.status !== "ACTIVE") throw new Error("COMPANY_INACTIVE");
  if (!membership || membership.status !== "ACTIVE") throw new Error("MEMBER_INACTIVE");
  if (!input.allowedRoles.includes(membership.role)) throw new Error("ROLE_NOT_ALLOWED");
  return { user, company, membership };
}

type ExistingGrant = {
  id: string;
  companyId: string;
  recruitmentTier: PaidRecruitmentTier;
  validFrom: Date;
  expiresAt: Date | null;
  source: string;
  sourceReference: string | null;
  productEntitlement: { product: { code: string | null } } | null;
};

function replayGrant(
  existing: ExistingGrant,
  expected: {
    companyId: string;
    source: string;
    sourceReference: string;
    productCode: ManagedAdvertisementProductCode;
  },
): AdvertisementEntitlementGrantResult {
  if (
    existing.companyId !== expected.companyId ||
    existing.source !== expected.source ||
    existing.sourceReference !== expected.sourceReference ||
    existing.productEntitlement?.product.code !== expected.productCode ||
    !existing.expiresAt
  ) {
    throw new Error("ADVERTISEMENT_ENTITLEMENT_IDEMPOTENCY_CONFLICT");
  }
  return {
    entitlementId: existing.id,
    companyId: existing.companyId,
    productCode: expected.productCode,
    recruitmentTier: existing.recruitmentTier,
    validFrom: existing.validFrom,
    expiresAt: existing.expiresAt,
    alreadyGranted: true,
  };
}

export async function grantCompanyAdvertisementEntitlement(input: {
  actorUserId?: string;
  companyId: string;
  productCode: string;
  source: AdvertisementEntitlementGrantSource;
  sourceReference: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<AdvertisementEntitlementGrantResult> {
  const companyId = normalizeRequiredToken(input.companyId, "COMPANY_ID_REQUIRED");
  const sourceReference = normalizeRequiredToken(input.sourceReference, "SOURCE_REFERENCE_REQUIRED");
  const idempotencyKey = normalizeRequiredToken(input.idempotencyKey, "IDEMPOTENCY_KEY_REQUIRED");
  const policy = getAdvertisementProductPolicy(input.productCode.trim());
  if (!policy) throw new Error("ADVERTISEMENT_PRODUCT_CODE_INVALID");
  const source = ENTITLEMENT_SOURCE[input.source];

  if (input.source === "ADMIN") {
    const actorUserId = normalizeRequiredToken(input.actorUserId ?? "", "ADMIN_REQUIRED");
    await assertActiveAdmin(actorUserId);
  } else if (input.actorUserId) {
    throw new Error("SYSTEM_GRANT_ACTOR_NOT_ALLOWED");
  }
  await assertActiveCompany(companyId);

  const replaySelect = {
    id: true,
    companyId: true,
    recruitmentTier: true,
    validFrom: true,
    expiresAt: true,
    source: true,
    sourceReference: true,
    productEntitlement: {
      select: { product: { select: { code: true } } },
    },
  } as const;

  const existing = await prisma.companyRecruitmentEntitlement.findUnique({
    where: { idempotencyKey },
    select: replaySelect,
  });
  if (existing) {
    return replayGrant(existing as ExistingGrant, {
      companyId,
      source,
      sourceReference,
      productCode: policy.code,
    });
  }

  const managedProduct = await getManagedAdvertisementProductByCode(policy.code);
  const validFrom = input.now ?? new Date();
  if (Number.isNaN(validFrom.getTime())) throw new Error("INVALID_GRANT_TIME");
  const expiresAt = addDays(validFrom, managedProduct.durationDays);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, status: true },
      });
      if (!company || company.status !== "ACTIVE") throw new Error("COMPANY_INACTIVE");

      const duplicate = await tx.companyRecruitmentEntitlement.findUnique({
        where: { idempotencyKey },
        select: replaySelect,
      });
      if (duplicate) {
        return { replay: duplicate as ExistingGrant, created: null };
      }

      const entitlement = await tx.companyRecruitmentEntitlement.create({
        data: {
          companyId,
          productEntitlementId: managedProduct.productEntitlementId,
          recruitmentTier: managedProduct.recruitmentTier,
          validFrom,
          expiresAt,
          source,
          sourceReference,
          idempotencyKey,
        },
        select: {
          id: true,
          companyId: true,
          recruitmentTier: true,
          validFrom: true,
          expiresAt: true,
        },
      });

      if (input.source === "ADMIN" && input.actorUserId) {
        await tx.adminLog.create({
          data: {
            adminId: input.actorUserId,
            action: "ADVERTISEMENT_ENTITLEMENT_GRANTED",
            targetType: "CompanyRecruitmentEntitlement",
            targetId: entitlement.id,
            metadata: {
              companyId,
              productCode: managedProduct.code,
              recruitmentTier: managedProduct.recruitmentTier,
              sourceReference,
            },
          },
        });
      }

      return { replay: null, created: entitlement };
    });

    if (created.replay) {
      return replayGrant(created.replay, {
        companyId,
        source,
        sourceReference,
        productCode: policy.code,
      });
    }
    if (!created.created?.expiresAt) throw new Error("ADVERTISEMENT_ENTITLEMENT_EXPIRY_REQUIRED");
    return {
      entitlementId: created.created.id,
      companyId: created.created.companyId,
      productCode: managedProduct.code,
      recruitmentTier: created.created.recruitmentTier,
      validFrom: created.created.validFrom,
      expiresAt: created.created.expiresAt,
      alreadyGranted: false,
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "P2002") throw error;
    const duplicate = await prisma.companyRecruitmentEntitlement.findUnique({
      where: { idempotencyKey },
      select: replaySelect,
    });
    if (!duplicate) throw error;
    return replayGrant(duplicate as ExistingGrant, {
      companyId,
      source,
      sourceReference,
      productCode: policy.code,
    });
  }
}

export async function assertCompanyAdvertisementWriteAccess(input: {
  actorUserId: string;
  companyId: string;
}) {
  return assertCompanyMembershipAccess({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    allowedRoles: ["OWNER", "MANAGER"],
  });
}

export async function listActiveCompanyAdvertisementEntitlements(input: {
  actorUserId: string;
  companyId: string;
  now?: Date;
}) {
  await assertCompanyMembershipAccess({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    allowedRoles: ["OWNER", "MANAGER", "STAFF"],
  });
  const now = input.now ?? new Date();
  return prisma.companyRecruitmentEntitlement.findMany({
    where: {
      companyId: input.companyId,
      validFrom: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      productEntitlement: { product: { status: "ACTIVE", type: "ADVERTISEMENT" } },
    },
    select: {
      id: true,
      recruitmentTier: true,
      validFrom: true,
      expiresAt: true,
      productEntitlement: {
        select: {
          product: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: [{ recruitmentTier: "desc" }, { validFrom: "desc" }],
  });
}

export const MANAGED_ADVERTISEMENT_PRODUCT_CODES = Object.values(
  ADVERTISEMENT_PRODUCT_CATALOG,
).map((product) => product.code);