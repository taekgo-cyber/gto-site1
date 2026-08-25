import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findUnique: vi.fn() },
  company: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  adminLog: { findMany: vi.fn() },
}));
const notifyMock = vi.hoisted(() => vi.fn().mockResolvedValue({ delivered: true }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications/service", () => ({ createInAppNotification: notifyMock }));

import { listPublicCompanies, getPublicCompany } from "@/lib/company/public";
import { changeCompanyOperationalStatus, listAdminCompanies } from "@/lib/company/admin";

beforeEach(() => vi.clearAllMocks());

describe("S22 public Company boundary", () => {
  it("lists only non-deleted ACTIVE companies and public post counts", async () => {
    prismaMock.company.count.mockResolvedValue(1);
    prismaMock.company.findMany.mockResolvedValue([]);
    await listPublicCompanies({ query: "운송", page: 1 });
    const call = prismaMock.company.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: "ACTIVE", deletedAt: null });
    expect(call.select).not.toHaveProperty("businessNumber");
    expect(call.select).not.toHaveProperty("phone");
    expect(call.select).not.toHaveProperty("email");
    expect(call.select._count.select.jobPosts.where).toMatchObject({ status: "OPEN", deletedAt: null, publishedAt: { not: null } });
  });

  it("requires ACTIVE status again on direct detail lookup", async () => {
    prismaMock.company.findFirst.mockResolvedValue(null);
    await getPublicCompany("company_12345");
    expect(prismaMock.company.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "company_12345", status: "ACTIVE", deletedAt: null } }));
  });
});

describe("S22 admin Company lifecycle", () => {
  it("rechecks ACTIVE ADMIN before searchable/filterable list", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", role: "USER", status: "ACTIVE" });
    await expect(listAdminCompanies({ adminUserId: "u1", status: "ALL" })).rejects.toThrow("ADMIN_REQUIRED");
    expect(prismaMock.company.findMany).not.toHaveBeenCalled();
  });

  it("allows only ACTIVE <-> SUSPENDED with reason, conditional update and audit", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin", role: "ADMIN", status: "ACTIVE" });
    const tx = {
      company: {
        findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "ACTIVE", members: [{ userId: "owner" }] }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      adminLog: { create: vi.fn().mockResolvedValue({ id: "log" }) },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback(tx));
    await expect(changeCompanyOperationalStatus({ adminUserId: "admin", companyId: "c1", status: "SUSPENDED", reason: "서류 재확인 필요" })).resolves.toEqual({ id: "c1", status: "SUSPENDED" });
    expect(tx.company.updateMany).toHaveBeenCalledWith({ where: { id: "c1", status: "ACTIVE" }, data: { status: "SUSPENDED" } });
    expect(tx.adminLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_STATUS_CHANGE", metadata: { from: "ACTIVE", to: "SUSPENDED", reason: "서류 재확인 필요" } }) }));
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner" }), tx);
  });

  it("rejects an unsupported PENDING -> SUSPENDED transition", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin", role: "ADMIN", status: "ACTIVE" });
    prismaMock.$transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback({ company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", status: "PENDING", members: [] }) }, adminLog: { create: vi.fn() } }));
    await expect(changeCompanyOperationalStatus({ adminUserId: "admin", companyId: "c1", status: "SUSPENDED", reason: "검토 중 정지" })).rejects.toThrow("COMPANY_STATUS_TRANSITION_INVALID");
  });
});
