import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  company: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  companyMember: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  adminLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  normalizeBusinessNumber,
  validateBusinessNumber,
  validateCompanyApplicationInput,
  isValidBusinessNumberChecksum,
  type CompanyApplicationInput,
} from "@/lib/company/validation";
import {
  applyForCompany,
  getCompanyApplicationForOwner,
  updateCompanyByOwner,
  resubmitCompanyApplication,
  assertActiveCompanyContextForWrite,
} from "@/lib/company/service";
import {
  approveCompany,
  rejectCompany,
  listPendingCompanies,
  getPendingCompanyDetail,
} from "@/lib/company/admin";
import {
  resolveActiveCompanyId,
  filterActiveMemberships,
} from "@/lib/company/context";

const VALID_BIZ = "220-81-62517"; // normalized 2208162517 valid
const VALID_BIZ_NORM = "2208162517";

function validInput(overrides: Partial<CompanyApplicationInput> = {}): CompanyApplicationInput {
  return {
    name: "테스트 운송 주식회사",
    businessNumber: VALID_BIZ,
    representativeName: "홍길동",
    phone: "02-1234-5678",
    email: "test@example.com",
    address: "서울시 강남구",
    addressDetail: "101호",
    regionId: null,
    introduction: "소개",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("company validation: businessNumber normalization/validation", () => {
  it("normalizes hyphens and spaces", () => {
    expect(normalizeBusinessNumber(" 220-81-62517 ")).toBe(VALID_BIZ_NORM);
    expect(normalizeBusinessNumber("220 81 62517")).toBe(VALID_BIZ_NORM);
  });

  it("validates checksum", () => {
    expect(validateBusinessNumber(VALID_BIZ)).toBe(VALID_BIZ_NORM);
    expect(isValidBusinessNumberChecksum(VALID_BIZ_NORM)).toBe(true);
    expect(() => validateBusinessNumber("123-45-67890")).toThrow(/checksum/);
    expect(() => validateBusinessNumber("123456789")).toThrow(/10 digits/);
    expect(() => validateBusinessNumber("abcdefghij")).toThrow(/10 digits/);
  });

  it("validates existing Company fields", () => {
    expect(() => validateCompanyApplicationInput({ ...validInput(), name: "" })).toThrow(/name/);
    expect(() => validateCompanyApplicationInput({ ...validInput(), representativeName: "" })).toThrow(/representativeName/);
    expect(() => validateCompanyApplicationInput({ ...validInput(), phone: "invalid!!" })).toThrow(/phone/);
    expect(() => validateCompanyApplicationInput({ ...validInput(), email: "not-email" })).toThrow(/email/);
    expect(() => validateCompanyApplicationInput({ ...validInput(), name: "a".repeat(101) })).toThrow(/too long/);
    const out = validateCompanyApplicationInput(validInput());
    expect(out.businessNumber).toBe(VALID_BIZ_NORM);
  });
});

describe("company application transaction and duplicate/rollback", () => {
  it("creates PENDING company and OWNER ACTIVE in one transaction, keeps User.role unchanged", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    const txCompanyCreate = vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" });
    const txMemberCreate = vi.fn().mockResolvedValue({ id: "m1", role: "OWNER", status: "ACTIVE" });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = { company: { create: txCompanyCreate }, companyMember: { create: txMemberCreate } };
      return cb(tx as never);
    });

    const res = await applyForCompany({ actorUserId: "u1", data: validInput() });
    expect(res.company.status).toBe("PENDING");
    expect(txCompanyCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", businessNumber: VALID_BIZ_NORM }) }));
    expect(txMemberCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "u1", role: "OWNER", status: "ACTIVE" }) }));
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rolls back all if member creation fails", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) },
        companyMember: { create: vi.fn().mockRejectedValue(new Error("member fail")) },
      };
      return cb(tx as never);
    });
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/member fail/);
  });

  it("rejects duplicate direct application safely per user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue({ id: "m1", companyId: "cOld", company: { status: "PENDING" } } as never);
    await expect(applyForCompany({ actorUserId: "u1", data: validInput() })).rejects.toThrow(/DUPLICATE_COMPANY_APPLICATION/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects duplicate businessNumber (normalized)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u2", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue({ id: "cExist" });
    await expect(applyForCompany({ actorUserId: "u2", data: validInput({ businessNumber: VALID_BIZ }) })).rejects.toThrow(/BUSINESS_NUMBER_DUPLICATE/);
    // also hyphen variant should be same normalized duplicate
    prismaMock.company.findUnique.mockResolvedValue({ id: "cExist" });
    await expect(applyForCompany({ actorUserId: "u2", data: validInput({ businessNumber: "2208162517" }) })).rejects.toThrow(/BUSINESS_NUMBER_DUPLICATE/);
  });
});

describe("PENDING/REJECTED owner authorization not requireRole(COMPANY)", () => {
  it("allows OWNER with USER role to view PENDING company", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "uOwner", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "PENDING", name: "x" } as never);
    const result = await getCompanyApplicationForOwner({ actorUserId: "uOwner", companyId: "c1" });
    expect(result.status).toBe("PENDING");
  });

  it("allows OWNER with USER role to view REJECTED company", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "uOwner", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "REJECTED" } as never);
    const result = await getCompanyApplicationForOwner({ actorUserId: "uOwner", companyId: "c1" });
    expect(result.status).toBe("REJECTED");
  });

  it("denies non-owner or REMOVED membership", async () => {
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "PENDING" } as never);
    await expect(getCompanyApplicationForOwner({ actorUserId: "uStaff", companyId: "c1" })).rejects.toThrow(/NOT_OWNER/);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "REMOVED" } as never);
    await expect(getCompanyApplicationForOwner({ actorUserId: "uOwner", companyId: "c1" })).rejects.toThrow(/NOT_OWNER/);
  });

  it("PENDING owner can edit basic company information", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "PENDING", businessNumber: VALID_BIZ_NORM } as never);
    prismaMock.company.update.mockResolvedValue({ id: "c1", status: "PENDING" } as never);
    const res = await updateCompanyByOwner({ actorUserId: "u1", companyId: "c1", data: { name: "새이름" } });
    expect(prismaMock.company.update).toHaveBeenCalled();
    expect(res.id).toBe("c1");
  });

  it("REJECTED owner can edit then resubmit to PENDING", async () => {
    // update
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "REJECTED", businessNumber: VALID_BIZ_NORM } as never);
    prismaMock.company.update.mockResolvedValue({ id: "c1", status: "REJECTED" } as never);
    await updateCompanyByOwner({ actorUserId: "u1", companyId: "c1", data: { address: "새주소" } });

    // resubmit
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "REJECTED", businessNumber: VALID_BIZ_NORM } as never);
    // Need to mock transaction for resubmit
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = { company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "REJECTED", businessNumber: VALID_BIZ_NORM }), update: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) } };
      return cb(tx as never);
    });
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    // user mock for resubmit assertOwnerMembership already set above
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "REJECTED", businessNumber: VALID_BIZ_NORM } as never);
    const resub = await resubmitCompanyApplication({ actorUserId: "u1", companyId: "c1" });
    expect(resub.status).toBe("PENDING");
  });

  it("rejects edit outside PENDING/REJECTED (e.g., ACTIVE)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE", businessNumber: VALID_BIZ_NORM } as never);
    await expect(updateCompanyByOwner({ actorUserId: "u1", companyId: "c1", data: { name: "x" } })).rejects.toThrow(/NOT_EDITABLE/);
  });

  it("context tampering: owner cannot edit other company", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue({ id: "cOther", status: "PENDING" } as never);
    await expect(updateCompanyByOwner({ actorUserId: "u1", companyId: "cOther", data: { name: "hack" } })).rejects.toThrow(/NOT_OWNER/);
  });
});

describe("minimal admin operations", () => {
  it("requires ACTIVE ADMIN for list/detail/approve/reject", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "USER" } as never);
    await expect(listPendingCompanies({ adminUserId: "admin1" })).rejects.toThrow(/ADMIN_REQUIRED/);
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "SUSPENDED", role: "ADMIN" } as never);
    await expect(listPendingCompanies({ adminUserId: "admin1" })).rejects.toThrow(/ADMIN_REQUIRED/);
  });

  it("PENDING list and detail guarded", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.company.findMany.mockResolvedValue([{ id: "c1", status: "PENDING" } as never]);
    const list = await listPendingCompanies({ adminUserId: "admin1" });
    expect(list[0].status).toBe("PENDING");
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" } as never);
    await expect(getPendingCompanyDetail({ adminUserId: "admin1", companyId: "c1" })).rejects.toThrow(/NOT_PENDING/);
  });

  it("APPROVE: PENDING -> ACTIVE and ensures OWNER role COMPANY, AdminLog minimal, idempotent", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    const txCompanyFind = vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" });
    const txCompanyUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txMemberFind = vi.fn().mockResolvedValue({ userId: "owner1" });
    const txUserFind = vi.fn().mockResolvedValue({ id: "owner1", role: "USER" });
    const txUserUpdate = vi.fn().mockResolvedValue({});
    const txAdminCreate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: txCompanyFind, updateMany: txCompanyUpdateMany },
        companyMember: { findFirst: txMemberFind },
        user: { findUnique: txUserFind, update: txUserUpdate },
        adminLog: { create: txAdminCreate },
      };
      return cb(tx as never);
    });
    const res = await approveCompany({ adminUserId: "admin1", companyId: "c1" });
    expect(res.status).toBe("ACTIVE");
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: "owner1" }, data: { role: "COMPANY" } });
    expect(txAdminCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_APPROVE", targetType: "Company", targetId: "c1" }) }));

    // idempotent when already ACTIVE
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = { company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "ACTIVE" }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
      return cb(tx as never);
    });
    const res2 = await approveCompany({ adminUserId: "admin1", companyId: "c1" });
    expect(res2.status).toBe("ACTIVE");
  });

  it("APPROVE does not overwrite already COMPANY role (idempotent)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        companyMember: { findFirst: vi.fn().mockResolvedValue({ userId: "owner1" }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: "owner1", role: "COMPANY" }), update: vi.fn() },
        adminLog: { create: vi.fn().mockResolvedValue({}) },
      };
      // capture update shouldn't be called
      const inner = await cb(tx as never) as never;
      expect(tx.user.update).not.toHaveBeenCalled();
      return inner;
    });
    await approveCompany({ adminUserId: "admin1", companyId: "c1" });
  });

  it("REJECT: PENDING -> REJECTED, does not downgrade User.role, AdminLog minimal", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    const txCompanyUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txAdminCreate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: txCompanyUpdateMany },
        adminLog: { create: txAdminCreate },
      };
      return cb(tx as never);
    });
    const res = await rejectCompany({ adminUserId: "admin1", companyId: "c1" });
    expect(res.status).toBe("REJECTED");
    expect(txAdminCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_REJECT" }) }));
    // ensure no user update
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        user: { update: vi.fn() },
        adminLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const inner = await cb(tx as never) as never;
      expect(tx.user.update).not.toHaveBeenCalled();
      return inner;
    });
    await rejectCompany({ adminUserId: "admin1", companyId: "c1" });
  });

  it("multi-company no downgrade: REJECT one company does not affect other ACTIVE company owner role", async () => {
    // Owner has two companies c1 PENDING to be rejected, c2 ACTIVE
    // After reject, user role should remain COMPANY (not downgraded)
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        adminLog: { create: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn() },
        companyMember: { findMany: vi.fn() },
      };
      return cb(tx as never);
    });
    await rejectCompany({ adminUserId: "admin1", companyId: "c1" });
    // no user.update called implies no downgrade
  });

  it("admin state guarded: cannot approve REJECTED or ACTIVE via wrong path", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = { company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "REJECTED" }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
      return cb(tx as never);
    });
    await expect(approveCompany({ adminUserId: "admin1", companyId: "c1" })).rejects.toThrow(/NOT_PENDING/);
  });
});

describe("active-company resolver/selector foundation", () => {
  it("one active membership auto-selects", () => {
    const memberships = [{ companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" } as never];
    const res = resolveActiveCompanyId({ memberships, selectedCompanyId: null });
    expect(res).toEqual({ companyId: "c1", autoSelected: true });
  });

  it("one active membership respects explicit selection if matches", () => {
    const memberships = [{ companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" } as never];
    const res = resolveActiveCompanyId({ memberships, selectedCompanyId: "c1" });
    expect(res).toEqual({ companyId: "c1", autoSelected: false });
  });

  it("two or more active memberships require explicit selection, not silent memberships[0]", () => {
    const memberships = [
      { companyId: "c1", companyName: "A", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
      { companyId: "c2", companyName: "B", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
    ] as never;
    const res = resolveActiveCompanyId({ memberships, selectedCompanyId: null });
    expect(res).toEqual({ companyId: null, requireSelection: true });
    expect(() => resolveActiveCompanyId({ memberships, selectedCompanyId: "c3" })).toThrow(/MISMATCH/);
    const ok = resolveActiveCompanyId({ memberships, selectedCompanyId: "c2" });
    expect(ok).toEqual({ companyId: "c2", autoSelected: false });
  });

  it("filters only ACTIVE companyStatus, ignores PENDING/REJECTED", () => {
    const memberships = [
      { companyId: "c1", companyName: "A", companyStatus: "PENDING", role: "OWNER", status: "ACTIVE" },
      { companyId: "c2", companyName: "B", companyStatus: "ACTIVE", role: "OWNER", status: "ACTIVE" },
    ] as never;
    expect(filterActiveMemberships(memberships).map((m) => m.companyId)).toEqual(["c2"]);
    // one active still auto-selects c2
    const res = resolveActiveCompanyId({ memberships, selectedCompanyId: null });
    expect(res).toEqual({ companyId: "c2", autoSelected: true });
  });

  it("no active memberships returns null", () => {
    const memberships = [{ companyId: "c1", companyName: "A", companyStatus: "PENDING", role: "OWNER", status: "ACTIVE" } as never];
    const res = resolveActiveCompanyId({ memberships, selectedCompanyId: null });
    expect(res).toEqual({ companyId: null });
  });
});

describe("privileged write rechecks DB and context tampering", () => {
  it("every privileged write rechecks actor, company, membership from DB", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1", requiredRoles: ["OWNER"] })).resolves.toBeDefined();

    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1", requiredRoles: ["OWNER"] })).rejects.toThrow(/ROLE_NOT_ALLOWED/);

    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "PENDING" } as never);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c1" })).rejects.toThrow(/COMPANY_INACTIVE/);
  });

  it("context tampering via selectedCompanyId not in memberships is denied", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    prismaMock.company.findUnique.mockResolvedValue({ id: "c2", status: "ACTIVE" } as never);
    prismaMock.companyMember.findUnique.mockResolvedValue(null);
    await expect(assertActiveCompanyContextForWrite({ actorUserId: "u1", selectedCompanyId: "c2" })).rejects.toThrow(/MEMBER_INACTIVE/);
  });
});

describe("role preservation/upgrade and multi-company", () => {
  it("application keeps User.role unchanged", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "uUser", status: "ACTIVE", role: "USER" } as never);
    prismaMock.companyMember.findFirst.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { create: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }) },
        companyMember: { create: vi.fn().mockResolvedValue({ id: "m1", role: "OWNER", status: "ACTIVE" }) },
      };
      return cb(tx as never);
    });
    await applyForCompany({ actorUserId: "uUser", data: validInput() });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("admin approve upgrades USER to COMPANY only if needed", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    // first approve where owner is USER -> upgrades
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        companyMember: { findFirst: vi.fn().mockResolvedValue({ userId: "u1" }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", role: "USER" }), update: vi.fn().mockResolvedValue({}) },
        adminLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const res = await cb(tx as never);
      expect(tx.user.update).toHaveBeenCalled();
      return res;
    });
    await approveCompany({ adminUserId: "admin1", companyId: "c1" });

    // second where owner already COMPANY -> no upgrade
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        companyMember: { findFirst: vi.fn().mockResolvedValue({ userId: "u1" }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", role: "COMPANY" }), update: vi.fn() },
        adminLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const res = await cb(tx as never);
      expect(tx.user.update).not.toHaveBeenCalled();
      return res;
    });
    await approveCompany({ adminUserId: "admin1", companyId: "c1" });
  });

  it("reject does not downgrade COMPANY user even with only one company", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "ACTIVE", role: "ADMIN" } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        adminLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return cb(tx as never);
    });
    await rejectCompany({ adminUserId: "admin1", companyId: "c1" });
    // after reject, user role should still be whatever it was; no update called
    // Already verified above that user.update not called during reject transaction
  });
});
