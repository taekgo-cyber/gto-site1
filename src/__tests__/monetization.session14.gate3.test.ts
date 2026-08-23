import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  companyFindUnique: vi.fn(),
  companyMemberFindUnique: vi.fn(),
  productFindUnique: vi.fn(),
  entitlementFindUnique: vi.fn(),
  entitlementFindMany: vi.fn(),
  entitlementCreate: vi.fn(),
  entitlementUpdateMany: vi.fn(),
  productUpdate: vi.fn(),
  adminLogCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    company: { findUnique: mocks.companyFindUnique },
    companyRecruitmentEntitlement: {
      findUnique: mocks.entitlementFindUnique,
      create: mocks.entitlementCreate,
      updateMany: mocks.entitlementUpdateMany,
    },
    product: { update: mocks.productUpdate },
    adminLog: { create: mocks.adminLogCreate },
  };
  return {
    prisma: {
      user: { findUnique: mocks.userFindUnique },
      company: { findUnique: mocks.companyFindUnique },
      companyMember: { findUnique: mocks.companyMemberFindUnique },
      product: { findUnique: mocks.productFindUnique },
      companyRecruitmentEntitlement: {
        findUnique: mocks.entitlementFindUnique,
        findMany: mocks.entitlementFindMany,
      },
      $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx),
    },
  };
});

import {
  assertCompanyAdvertisementWriteAccess,
  grantCompanyAdvertisementEntitlement,
  listActiveCompanyAdvertisementEntitlements,
} from "@/lib/monetization/service";
import {
  cancelCompanyAdvertisementEntitlement,
  setManagedAdvertisementProductStatus,
} from "@/lib/monetization/service";

const now = new Date("2026-08-24T00:00:00.000Z");

function activeManagedProduct() {
  return {
    id: "product-general",
    code: "AD_GENERAL_7D",
    name: "일반 광고 7일",
    price: 40_000,
    type: "ADVERTISEMENT",
    status: "ACTIVE",
    recruitmentEntitlement: {
      id: "product-entitlement-general",
      recruitmentTier: "GENERAL",
      weeklyMatchQuota: 3,
    },
  };
}

describe("Session 14 Gate 3 entitlement activation and company authorization", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    mocks.companyFindUnique.mockResolvedValue({ id: "company-1", status: "ACTIVE" });
    mocks.productFindUnique.mockResolvedValue(activeManagedProduct());
    mocks.entitlementFindUnique.mockResolvedValue(null);
    mocks.entitlementCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "company-entitlement-1",
      companyId: data.companyId,
      recruitmentTier: data.recruitmentTier,
      validFrom: data.validFrom,
      expiresAt: data.expiresAt,
    }));
    mocks.adminLogCreate.mockResolvedValue({ id: "log-1" });
    mocks.productUpdate.mockImplementation(async ({ data }: { data: { status: string } }) => ({
      id: "product-general",
      code: "AD_GENERAL_7D",
      status: data.status,
    }));
    mocks.entitlementUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("creates an auditable 7-day admin grant without touching Order history", async () => {
    const result = await grantCompanyAdvertisementEntitlement({
      actorUserId: "admin-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      source: "ADMIN",
      sourceReference: "manual:company-1:20260824",
      idempotencyKey: "ad-grant:company-1:manual-1",
      now,
    });

    expect(result).toMatchObject({
      entitlementId: "company-entitlement-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      recruitmentTier: "GENERAL",
      alreadyGranted: false,
    });
    expect(result.expiresAt.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(mocks.entitlementCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        productEntitlementId: "product-entitlement-general",
        source: "ADVERTISEMENT_ADMIN_GRANT",
        sourceReference: "manual:company-1:20260824",
        idempotencyKey: "ad-grant:company-1:manual-1",
      }),
    }));
    expect(mocks.adminLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminId: "admin-1",
        action: "ADVERTISEMENT_ENTITLEMENT_GRANTED",
      }),
    }));
  });

  it("replays the same grant idempotently without a second create", async () => {
    mocks.entitlementFindUnique.mockResolvedValue({
      id: "existing-entitlement",
      companyId: "company-1",
      recruitmentTier: "GENERAL",
      validFrom: now,
      expiresAt: new Date("2026-08-31T00:00:00.000Z"),
      source: "ADVERTISEMENT_ADMIN_GRANT",
      sourceReference: "manual:company-1:20260824",
      productEntitlement: { product: { code: "AD_GENERAL_7D" } },
    });

    const result = await grantCompanyAdvertisementEntitlement({
      actorUserId: "admin-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      source: "ADMIN",
      sourceReference: "manual:company-1:20260824",
      idempotencyKey: "ad-grant:company-1:manual-1",
      now,
    });
    expect(result.alreadyGranted).toBe(true);
    expect(mocks.entitlementCreate).not.toHaveBeenCalled();
  });

  it("rejects idempotency-key reuse for a different logical grant", async () => {
    mocks.entitlementFindUnique.mockResolvedValue({
      id: "existing-entitlement",
      companyId: "company-1",
      recruitmentTier: "GENERAL",
      validFrom: now,
      expiresAt: new Date("2026-08-31T00:00:00.000Z"),
      source: "ADVERTISEMENT_ADMIN_GRANT",
      sourceReference: "manual:company-1:DIFFERENT",
      productEntitlement: { product: { code: "AD_GENERAL_7D" } },
    });

    await expect(grantCompanyAdvertisementEntitlement({
      actorUserId: "admin-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      source: "ADMIN",
      sourceReference: "manual:company-1:20260824",
      idempotencyKey: "ad-grant:company-1:manual-1",
      now,
    })).rejects.toThrow("ADVERTISEMENT_ENTITLEMENT_IDEMPOTENCY_CONFLICT");
  });

  it("denies a non-admin actor from the admin grant path", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", role: "USER", status: "ACTIVE" });
    await expect(grantCompanyAdvertisementEntitlement({
      actorUserId: "user-1",
      companyId: "company-1",
      productCode: "AD_GENERAL_7D",
      source: "ADMIN",
      sourceReference: "manual-1",
      idempotencyKey: "key-1",
      now,
    })).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.entitlementCreate).not.toHaveBeenCalled();
  });

  it("allows OWNER/MANAGER writes but keeps STAFF read-only", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "member-1", role: "COMPANY", status: "ACTIVE" });
    mocks.companyMemberFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    await expect(assertCompanyAdvertisementWriteAccess({ actorUserId: "member-1", companyId: "company-1" })).resolves.toBeTruthy();

    mocks.companyMemberFindUnique.mockResolvedValue({ role: "MANAGER", status: "ACTIVE" });
    await expect(assertCompanyAdvertisementWriteAccess({ actorUserId: "member-1", companyId: "company-1" })).resolves.toBeTruthy();

    mocks.companyMemberFindUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" });
    await expect(assertCompanyAdvertisementWriteAccess({ actorUserId: "member-1", companyId: "company-1" })).rejects.toThrow("ROLE_NOT_ALLOWED");
  });

  it("allows STAFF to inspect its own company's active advertisement entitlement only", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "staff-1", role: "COMPANY", status: "ACTIVE" });
    mocks.companyMemberFindUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" });
    mocks.entitlementFindMany.mockResolvedValue([{ id: "ent-1", recruitmentTier: "GENERAL" }]);

    await expect(listActiveCompanyAdvertisementEntitlements({
      actorUserId: "staff-1",
      companyId: "company-1",
      now,
    })).resolves.toEqual([{ id: "ent-1", recruitmentTier: "GENERAL" }]);
    expect(mocks.entitlementFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-1", cancelledAt: null }),
    }));
  });

  it("allows ACTIVE ADMIN to pause a managed product without changing locked policy", async () => {
    await expect(setManagedAdvertisementProductStatus({
      actorUserId: "admin-1",
      productCode: "AD_GENERAL_7D",
      status: "INACTIVE",
    })).resolves.toMatchObject({ status: "INACTIVE", changed: true });
    expect(mocks.productUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "INACTIVE" },
    }));
    expect(mocks.adminLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ADVERTISEMENT_PRODUCT_INACTIVE" }),
    }));
  });

  it("cancels an active contract without rewriting its original expiry", async () => {
    const expiresAt = new Date("2026-08-31T00:00:00.000Z");
    mocks.entitlementFindUnique.mockResolvedValue({
      id: "company-entitlement-1",
      companyId: "company-1",
      validFrom: now,
      expiresAt,
      cancelledAt: null,
      productEntitlement: { product: { code: "AD_GENERAL_7D" } },
    });
    const result = await cancelCompanyAdvertisementEntitlement({
      actorUserId: "admin-1",
      entitlementId: "company-entitlement-1",
      reason: "운영 취소",
      now: new Date("2026-08-25T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ alreadyCancelled: false, expiresAt });
    expect(mocks.entitlementUpdateMany).toHaveBeenCalledWith({
      where: { id: "company-entitlement-1", cancelledAt: null },
      data: { cancelledAt: new Date("2026-08-25T00:00:00.000Z"), cancelReason: "운영 취소" },
    });
    expect(mocks.adminLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "ADVERTISEMENT_ENTITLEMENT_CANCELLED",
        metadata: expect.objectContaining({ originalExpiresAt: expiresAt.toISOString() }),
      }),
    }));
  });

  it("replays an already-cancelled contract safely without a second mutation", async () => {
    const cancelledAt = new Date("2026-08-25T00:00:00.000Z");
    mocks.entitlementFindUnique.mockResolvedValue({
      id: "company-entitlement-1",
      companyId: "company-1",
      validFrom: now,
      expiresAt: new Date("2026-08-31T00:00:00.000Z"),
      cancelledAt,
      productEntitlement: { product: { code: "AD_GENERAL_7D" } },
    });
    await expect(cancelCompanyAdvertisementEntitlement({
      actorUserId: "admin-1",
      entitlementId: "company-entitlement-1",
      now: new Date("2026-08-26T00:00:00.000Z"),
    })).resolves.toMatchObject({ alreadyCancelled: true, cancelledAt });
    expect(mocks.entitlementUpdateMany).not.toHaveBeenCalled();
  });
});