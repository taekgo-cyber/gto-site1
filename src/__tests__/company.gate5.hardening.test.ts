import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  company: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  companyMember: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  adminLog: { create: vi.fn() },
}));
const createInAppNotificationMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ delivered: true, item: null }),
);

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications/service", () => ({
  createInAppNotification: createInAppNotificationMock,
}));

import {
  applyForCompany,
  getCompanyApplicationForOwner,
  updateCompanyByOwner,
  resubmitCompanyApplication,
  assertActiveCompanyContextForWrite,
} from "@/lib/company/service";
import { approveCompany, rejectCompany, listPendingCompanies } from "@/lib/company/admin";
import { resolveActiveCompanyId, filterActiveMemberships } from "@/lib/company/context";

const VALID_BIZ = "220-81-62517";
const VALID_BIZ_NORM = "2208162517";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "테스트 운송",
    businessNumber: VALID_BIZ,
    representativeName: "홍길동",
    phone: "02-1234-5678",
    email: "test@example.com",
    address: "서울",
    addressDetail: "101",
    regionId: null,
    introduction: "소개",
    ...overrides,
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("Gate5 company onboarding hardening", () => {
  it("USER_INACTIVE denied for application", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "SUSPENDED" } as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/USER_INACTIVE/);
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/USER_INACTIVE/);
  });

  it("USER_INACTIVE denied for PENDING owner management (get/edit/resubmit)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "SUSPENDED" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    await expect(getCompanyApplicationForOwner({ actorUserId: "u1", companyId: "c1" })).rejects.toThrow(/USER_INACTIVE/);
    await expect(updateCompanyByOwner({ actorUserId: "u1", companyId: "c1", data: { name: "x" } })).rejects.toThrow(/USER_INACTIVE/);
    await expect(resubmitCompanyApplication({ actorUserId: "u1", companyId: "c1" })).rejects.toThrow(/USER_INACTIVE/);
  });

  it("concurrent duplicate User: inside-transaction recheck blocks second apply even if outside check raced", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null); // outside sees none
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue({ id: "mExist" }) },
        company: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }),
        },
        companyMemberCreate: { create: vi.fn() },
      } as unknown as { companyMember: { findFirst: typeof prismaMock.companyMember.findFirst }; company: { findUnique: typeof prismaMock.company.findUnique; create: typeof prismaMock.company.create } };
      // adapt to our code's tx.companyMember.findFirst check
      const realTx = {
        companyMember: { findFirst: tx.companyMember.findFirst, create: vi.fn() },
        company: { findUnique: tx.company.findUnique, create: tx.company.create },
      };
      return cb(realTx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
  });

  it("same businessNumber concurrent maps P2002 to BUSINESS_NUMBER_DUPLICATE", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { create: vi.fn().mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002", meta: { target: ["businessNumber"] } })) },
        companyMember: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      };
      // our service wraps transaction in try/catch to map P2002
      // need to make tx.company.findUnique not duplicate
      const realTx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue(null) },
        company: { findUnique: vi.fn().mockResolvedValue(null), create: tx.company.create },
      };
      return cb(realTx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/BUSINESS_NUMBER_DUPLICATE/);
  });

  it("PENDING duplicate submit blocked (existing OWNER ACTIVE with PENDING company)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue({ id: "m1", companyId: "cPending" } as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
  });

  it("REJECTED->PENDING repeated resubmit second is blocked (already PENDING)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "PENDING" } as never);
    await expect(resubmitCompanyApplication({ actorUserId: "u1", companyId: "c1" })).rejects.toThrow(/COMPANY_NOT_REJECTED/);
  });

  it("existing ACTIVE Company new direct application blocked", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue({ id: "mActive", companyId: "cActive" } as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
  });

  it("different user editing PENDING denied", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "other", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue(null);
    await expect(updateCompanyByOwner({ actorUserId: "other", companyId: "c1", data: { name: "hack" } })).rejects.toThrow(/NOT_OWNER/);
  });

  it("concurrent approve/reject stale: already ACTIVE approve idempotent, REJECTED reject idempotent, cross stale throws", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    // already ACTIVE -> approve idempotent (no updateMany)
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "ACTIVE" }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return cb(tx as never);
    });
    const a1 = await approveCompany({ adminUserId: "admin1", companyId: "c1" });
    expect(a1.status).toBe("ACTIVE");

    // already REJECTED -> reject idempotent (no updateMany)
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "REJECTED" }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return cb(tx as never);
    });
    const r1 = await rejectCompany({ adminUserId: "admin1", companyId: "c1" });
    expect(r1.status).toBe("REJECTED");

    // approve REJECTED -> throw NOT_PENDING via conditional updateMany count 0
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "REJECTED" }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return cb(tx as never);
    });
    await expect(approveCompany({ adminUserId: "admin1", companyId: "c1" })).rejects.toThrow(/NOT_PENDING/);

    // reject ACTIVE -> throw NOT_PENDING via conditional updateMany count 0
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "ACTIVE" }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return cb(tx as never);
    });
    await expect(rejectCompany({ adminUserId: "admin1", companyId: "c1" })).rejects.toThrow(/NOT_PENDING/);
  });

  it("race: approve/reject conditional updateMany count 0 throws COMPANY_NOT_PENDING with no side effect", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);

    // approve race: findUnique sees PENDING but updateMany count 0 (concurrent already changed)
    const approveAdminCreate = vi.fn().mockResolvedValue({});
    const approveUserUpdate = vi.fn().mockResolvedValue({});
    const approveTxUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }),
          updateMany: approveTxUpdateMany,
        },
        companyMember: { findFirst: vi.fn() },
        user: { findUnique: vi.fn(), update: approveUserUpdate },
        adminLog: { create: approveAdminCreate },
      };
      return cb(tx as never);
    });
    await expect(approveCompany({ adminUserId: "admin1", companyId: "c1" })).rejects.toThrow(/COMPANY_NOT_PENDING/);
    expect(approveTxUpdateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    expect(approveAdminCreate).not.toHaveBeenCalled();
    expect(approveUserUpdate).not.toHaveBeenCalled();

    // reject race: findUnique sees PENDING but updateMany count 0
    const rejectAdminCreate = vi.fn().mockResolvedValue({});
    const rejectTxUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }),
          updateMany: rejectTxUpdateMany,
        },
        adminLog: { create: rejectAdminCreate },
      };
      return cb(tx as never);
    });
    await expect(rejectCompany({ adminUserId: "admin1", companyId: "c1" })).rejects.toThrow(/COMPANY_NOT_PENDING/);
    expect(rejectTxUpdateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "PENDING" },
      data: { status: "REJECTED" },
    });
    expect(rejectAdminCreate).not.toHaveBeenCalled();
  });

  it("transaction atomicity: member fail rolls back (no partial company visible via double call)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue(null) },
        company: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) },
      };
      const realTx = {
        companyMember: { findFirst: tx.companyMember.findFirst, create: vi.fn().mockRejectedValue(new Error("member fail")) },
        company: tx.company,
      };
      return cb(realTx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/member fail/);
  });

  it("resubmit state recheck inside transaction blocks stale REJECTED->PENDING race", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "REJECTED", businessNumber: VALID_BIZ_NORM } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = { company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING", businessNumber: VALID_BIZ_NORM }), update: vi.fn() } };
      return cb(tx as never);
    });
    await expect(resubmitCompanyApplication({ actorUserId: "u1", companyId: "c1" })).rejects.toThrow(/COMPANY_NOT_REJECTED/);
  });
});

describe("Gate5 active-company hardening", () => {
  it("selected company tampering denied (COMPANY_CONTEXT_MISMATCH)", () => {
    const memberships = [{ companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" } as never];
    expect(() => resolveActiveCompanyId({ memberships, selectedCompanyId: "c2" })).toThrow(/MISMATCH/);
  });

  it("multi-membership no silent fallback requires explicit selection", () => {
    const memberships = [
      { companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
      { companyId: "c2", companyName: "B", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
    ] as never;
    expect(resolveActiveCompanyId({ memberships, selectedCompanyId: null })).toEqual({ companyId: null, requireSelection: true });
  });

  it("stale selected id (pending company) not auto-selected", () => {
    const memberships = [{ companyId: "c1", companyName: "A", companyStatus: "PENDING", role: "OWNER", status: "ACTIVE" } as never];
    expect(filterActiveMemberships(memberships)).toEqual([]);
    expect(resolveActiveCompanyId({ memberships, selectedCompanyId: null })).toEqual({ companyId: null });
  });

  it("REMOVED member denied for privileged write", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "REMOVED" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1" })).rejects.toThrow(/MEMBER_INACTIVE/);
  });

  it("SUSPENDED/REJECTED/PENDING Company denied for privileged write", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    for (const status of ["SUSPENDED", "REJECTED", "PENDING"]) {
      prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status } as never);
      await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1" })).rejects.toThrow(/COMPANY_INACTIVE/);
    }
  });

  it("every privileged write rechecks actor/user/company/member/role and STAFF restricted", async () => {
    // STAFF should be denied when OWNER required
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1", requiredRoles: ["OWNER", "MANAGER"] })).rejects.toThrow(/ROLE_NOT_ALLOWED/);
    // OWNER allowed
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1", requiredRoles: ["OWNER", "MANAGER"] })).resolves.toBeDefined();
  });

  it("USER_INACTIVE also blocked for privileged write", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "SUSPENDED", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1" })).rejects.toThrow(/USER_INACTIVE/);
  });
});

describe("Gate5 admin company review hardening", () => {
  it("admin list selects no passwordHash — ensure select minimal", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.company.findMany.mockResolvedValue([{ id: "c1", name: "A", status: "PENDING" } as never]);
    await listPendingCompanies({ adminUserId: "admin1" });
    const call = prismaMock.company.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(call.select).not.toHaveProperty("passwordHash");
    expect(call.select).not.toHaveProperty("session");
    expect(call.select).not.toHaveProperty("token");
  });

  it("AdminLog minimal provenance (no raw stack)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    const txAdminCreate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        companyMember: { findFirst: vi.fn().mockResolvedValue(null) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        adminLog: { create: txAdminCreate },
      };
      return cb(tx as never);
    });
    await approveCompany({ adminUserId: "admin1", companyId: "c1" });
    const call = txAdminCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.action).toBe("COMPANY_APPROVE");
    expect(call.data.targetType).toBe("Company");
    expect(call.data.metadata).toEqual({ companyId: "c1" });
    expect(JSON.stringify(call.data)).not.toContain("stack");
  });

  it("approve success uses conditional updateMany and only then OWNER role + AdminLog; reject conditional with no role change", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);

    const approveUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const approveAdminCreate = vi.fn().mockResolvedValue({});
    const approveUserUpdate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }),
          updateMany: approveUpdateMany,
        },
        companyMember: { findFirst: vi.fn().mockResolvedValue({ userId: "owner1" }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: "owner1", role: "USER" }), update: approveUserUpdate },
        adminLog: { create: approveAdminCreate },
      };
      return cb(tx as never);
    });
    const approved = await approveCompany({ adminUserId: "admin1", companyId: "c1" });
    expect(approveUpdateMany).toHaveBeenCalledWith({ where: { id: "c1", status: "PENDING" }, data: { status: "ACTIVE" } });
    expect(approved).toEqual({ id: "c1", status: "ACTIVE" });
    expect(approveUserUpdate).toHaveBeenCalled();
    expect(approveAdminCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_APPROVE" }) }),
    );

    const rejectUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const rejectAdminCreate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: "c2", status: "PENDING" }),
          updateMany: rejectUpdateMany,
        },
        adminLog: { create: rejectAdminCreate },
      };
      return cb(tx as never);
    });
    const rejected = await rejectCompany({ adminUserId: "admin1", companyId: "c2" });
    expect(rejectUpdateMany).toHaveBeenCalledWith({ where: { id: "c2", status: "PENDING" }, data: { status: "REJECTED" } });
    expect(rejected).toEqual({ id: "c2", status: "REJECTED" });
    expect(rejectAdminCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_REJECT" }) }),
    );
  });
});

describe("Gate6 Sol High: Serializable isolation + bounded serialization conflict mapping", () => {
  it("applyForCompany requests Serializable isolation level via prisma.$transaction options", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: unknown, opts: unknown) => {
      expect(opts).toEqual(expect.objectContaining({ isolationLevel: "Serializable" }));
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue(null) },
        company: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }),
        },
      } as unknown;
      const realTx = {
        companyMember: { findFirst: (tx as { companyMember: { findFirst: typeof prismaMock.companyMember.findFirst } }).companyMember.findFirst, create: vi.fn().mockResolvedValue({ id: "m1", role: "OWNER", status: "ACTIVE" }) },
        company: (tx as { company: { findUnique: typeof prismaMock.company.findUnique; create: typeof prismaMock.company.create } }).company,
      };
      return (cb as (tx: unknown) => unknown)(realTx as never);
    });
    const res = await applyForCompany({ actorUserId: "u1", data: validInput() });
    expect(res.company.status).toBe("PENDING");
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
    const callOpts = (prismaMock.$transaction.mock.calls[0] as unknown[])[1] as { isolationLevel?: string };
    expect(callOpts?.isolationLevel).toBe("Serializable");
  });

  it("transaction mock accepts options signature - ensures Serializable is requested not default", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    let capturedOpts: unknown = null;
    prismaMock.$transaction.mockImplementation(async (cb: unknown, opts: unknown) => {
      capturedOpts = opts;
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "m1", role: "OWNER", status: "ACTIVE" }) },
        company: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) },
      };
      return (cb as (tx: unknown) => unknown)(tx as never);
    });
    await applyForCompany({ actorUserId: "u1", data: validInput() });
    expect(capturedOpts).toBeDefined();
    expect(capturedOpts).toEqual(expect.objectContaining({ isolationLevel: "Serializable" }));
  });

  it("P2034 serialization conflict maps to DUPLICATE_COMPANY_APPLICATION with no raw message leak", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    const raw = Object.assign(new Error("Transaction failed due to a write conflict or a deadlock. Please retry. Raw PG detail: 40001 serialization_failure leak_me"), { code: "P2034" });
    prismaMock.$transaction.mockRejectedValue(raw as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
    try {
      await applyForCompany({ actorUserId: "u1", data: validInput() });
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/DUPLICATE_COMPANY_APPLICATION/);
      expect(msg).not.toContain("Raw PG");
      expect(msg).not.toContain("serialization_failure");
      expect(msg).not.toContain("40001");
      expect(msg).not.toContain("deadlock");
    }
    // bounded: no retry - $transaction called exactly once per applyForCompany attempt
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2); // two attempts above, each once
  });

  it("PrismaPg DriverAdapterError TransactionWriteConflict maps to the bounded duplicate result", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    const adapterConflict = Object.assign(new Error("TransactionWriteConflict"), { name: "DriverAdapterError" });
    prismaMock.$transaction.mockRejectedValue(adapterConflict as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow("DUPLICATE_COMPANY_APPLICATION");
  });

  it("PostgreSQL 40001 and 40P01 codes also map bounded to DUPLICATE_COMPANY_APPLICATION without raw leak", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);

    const err40001 = Object.assign(new Error("40001 serialization_failure raw leak should not surface"), { code: "40001" });
    prismaMock.$transaction.mockRejectedValue(err40001 as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
    try {
      await applyForCompany({ actorUserId: "u1", data: validInput() });
    } catch (e) {
      expect((e as Error).message).not.toContain("40001");
      expect((e as Error).message).not.toContain("serialization");
    }

    const err40P01 = Object.assign(new Error("40P01 deadlock_detected raw leak"), { code: "40P01" });
    prismaMock.$transaction.mockRejectedValue(err40P01 as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
    try {
      await applyForCompany({ actorUserId: "u1", data: validInput() });
    } catch (e) {
      expect((e as Error).message).not.toContain("40P01");
      expect((e as Error).message).not.toContain("deadlock");
    }
  });

  it("P2002 businessNumber and atomicity still preserved alongside Serializable mapping", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    // P2002 case
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue(null) },
        company: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002", meta: { target: ["businessNumber"] } })) },
      };
      const realTx = {
        companyMember: { findFirst: tx.companyMember.findFirst, create: vi.fn() },
        company: tx.company,
      };
      return (cb as (tx: unknown) => unknown)(realTx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/BUSINESS_NUMBER_DUPLICATE/);

    // atomicity: member fail still rolls back, still with Serializable opts
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: unknown, opts: unknown) => {
      expect(opts).toEqual(expect.objectContaining({ isolationLevel: "Serializable" }));
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(new Error("member fail")) },
        company: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) },
      };
      const realTx = {
        companyMember: tx.companyMember,
        company: tx.company,
      };
      return (cb as (tx: unknown) => unknown)(realTx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/member fail/);
  });

  it("inside-transaction recheck still blocks duplicate OWNER even with Serializable", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: unknown, opts: unknown) => {
      expect(opts).toEqual(expect.objectContaining({ isolationLevel: "Serializable" }));
      const tx = {
        companyMember: { findFirst: vi.fn().mockResolvedValue({ id: "mExist" }) },
        company: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) },
      };
      const realTx = {
        companyMember: { findFirst: tx.companyMember.findFirst, create: vi.fn() },
        company: { findUnique: tx.company.findUnique, create: tx.company.create },
      };
      return (cb as (tx: unknown) => unknown)(realTx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
  });
});
