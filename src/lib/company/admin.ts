import { prisma } from "@/lib/prisma";
import { createInAppNotification } from "@/lib/notifications/service";

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, status: true, role: true },
  });
  if (!admin || admin.status !== "ACTIVE" || admin.role !== "ADMIN") {
    throw new Error("ADMIN_REQUIRED");
  }
  return admin;
}

const ADMIN_COMPANY_PAGE_SIZE = 20;

export async function listAdminCompanies(input: {
  adminUserId: string;
  query?: string;
  status?: "ALL" | "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";
  page?: number;
}) {
  await assertActiveAdmin(input.adminUserId);
  const query = input.query?.normalize("NFKC").trim().slice(0, 100) ?? "";
  const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? Math.min(input.page ?? 1, 10_000) : 1;
  const where = {
    deletedAt: null,
    ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { businessNumber: { contains: query.replace(/\D/g, "") } },
            { representativeName: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        businessNumber: true,
        representativeName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        region: { select: { name: true } },
        _count: { select: { jobPosts: true, leasePosts: true, leadMatches: true, adCampaigns: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * ADMIN_COMPANY_PAGE_SIZE,
      take: ADMIN_COMPANY_PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: ADMIN_COMPANY_PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / ADMIN_COMPANY_PAGE_SIZE)) };
}

export async function getAdminCompanyDetail(input: { adminUserId: string; companyId: string }) {
  await assertActiveAdmin(input.adminUserId);
  const [company, audit] = await Promise.all([
    prisma.company.findFirst({
      where: { id: input.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        businessNumber: true,
        representativeName: true,
        phone: true,
        email: true,
        address: true,
        addressDetail: true,
        introduction: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        region: { select: { id: true, name: true } },
        members: { select: { id: true, role: true, status: true, user: { select: { id: true, name: true, email: true, status: true, role: true } } }, orderBy: { createdAt: "asc" } },
        jobPosts: { select: { id: true, title: true, status: true, publishedAt: true }, orderBy: { createdAt: "desc" }, take: 10 },
        leasePosts: { select: { id: true, title: true, status: true, publishedAt: true }, orderBy: { createdAt: "desc" }, take: 10 },
        adCampaigns: { select: { id: true, title: true, status: true, startDate: true, endDate: true }, orderBy: { createdAt: "desc" }, take: 10 },
        leadMatches: { select: { id: true, status: true, createdAt: true, leadId: true }, orderBy: { createdAt: "desc" }, take: 10 },
        creditAccount: { select: { balance: true, updatedAt: true } },
        recruitmentEntitlements: { select: { id: true, recruitmentTier: true, validFrom: true, expiresAt: true, cancelledAt: true, source: true }, orderBy: { createdAt: "desc" }, take: 10 },
        quotaUsages: { select: { id: true, allowanceType: true, consumedCount: true, windowStart: true, windowEnd: true }, orderBy: { windowStart: "desc" }, take: 10 },
        _count: { select: { jobPosts: true, leasePosts: true, adCampaigns: true, leadMatches: true, leadContactUnlocks: true } },
      },
    }),
    prisma.adminLog.findMany({
      where: { targetType: "Company", targetId: input.companyId },
      select: { id: true, action: true, metadata: true, createdAt: true, admin: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  return { company, audit };
}

export async function changeCompanyOperationalStatus(input: {
  adminUserId: string;
  companyId: string;
  status: "ACTIVE" | "SUSPENDED";
  reason: string;
}) {
  await assertActiveAdmin(input.adminUserId);
  const reason = input.reason.normalize("NFKC").trim();
  if (reason.length < 2 || reason.length > 500) throw new Error("COMPANY_STATUS_REASON_INVALID");
  return prisma.$transaction(async (tx) => {
    const current = await tx.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, status: true, members: { where: { role: "OWNER", status: "ACTIVE" }, select: { userId: true } } },
    });
    if (!current) throw new Error("COMPANY_NOT_FOUND");
    if (current.status === input.status) return { id: current.id, status: current.status };
    const allowed = (current.status === "ACTIVE" && input.status === "SUSPENDED") || (current.status === "SUSPENDED" && input.status === "ACTIVE");
    if (!allowed) throw new Error("COMPANY_STATUS_TRANSITION_INVALID");
    const changed = await tx.company.updateMany({ where: { id: input.companyId, status: current.status }, data: { status: input.status } });
    if (changed.count === 0) throw new Error("COMPANY_STATUS_CONFLICT");
    await tx.adminLog.create({
      data: { adminId: input.adminUserId, action: "COMPANY_STATUS_CHANGE", targetType: "Company", targetId: input.companyId, metadata: { from: current.status, to: input.status, reason } },
    });
    for (const owner of current.members) {
      await createInAppNotification({
        userId: owner.userId,
        type: "ACTIVITY",
        title: input.status === "SUSPENDED" ? "업체 운영이 일시 정지되었습니다" : "업체 운영이 다시 활성화되었습니다",
        body: "자세한 내용은 업체 신청/운영 화면에서 확인해 주세요.",
        href: input.status === "ACTIVE" ? "/company/operations" : "/company/apply",
        dedupeKey: `company:${input.companyId}:status:${input.status}:${Date.now()}`,
      }, tx);
    }
    return { id: input.companyId, status: input.status };
  });
}

export async function listPendingCompanies(input: { adminUserId: string }) {
  await assertActiveAdmin(input.adminUserId);
  return prisma.company.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      name: true,
      businessNumber: true,
      representativeName: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getPendingCompanyDetail(input: { adminUserId: string; companyId: string }) {
  await assertActiveAdmin(input.adminUserId);
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: {
      id: true,
      name: true,
      businessNumber: true,
      representativeName: true,
      phone: true,
      email: true,
      address: true,
      addressDetail: true,
      regionId: true,
      introduction: true,
      status: true,
      createdAt: true,
    },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  if (company.status !== "PENDING") throw new Error("COMPANY_NOT_PENDING");
  return company;
}

export async function approveCompany(input: { adminUserId: string; companyId: string }) {
  await assertActiveAdmin(input.adminUserId);

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, status: true },
    });
    if (!company) throw new Error("COMPANY_NOT_FOUND");
    if (company.status === "ACTIVE") {
      // idempotent: already approved
      return company;
    }

    const { count } = await tx.company.updateMany({
      where: { id: input.companyId, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    if (count === 0) throw new Error("COMPANY_NOT_PENDING");

    const updatedCompany = { id: input.companyId, status: "ACTIVE" as const };

    // Find OWNER membership for this company
    const ownerMember = await tx.companyMember.findFirst({
      where: { companyId: input.companyId, role: "OWNER", status: "ACTIVE" },
      select: { userId: true },
    });

    if (ownerMember) {
      const ownerUser = await tx.user.findUnique({
        where: { id: ownerMember.userId },
        select: { id: true, role: true },
      });
      if (ownerUser && ownerUser.role !== "COMPANY") {
        await tx.user.update({
          where: { id: ownerMember.userId },
          data: { role: "COMPANY" },
        });
      }
      await createInAppNotification({
        userId: ownerMember.userId,
        type: "ACTIVITY",
        title: "업체 등록이 승인되었습니다",
        body: "업체 운영 기능을 사용할 수 있습니다.",
        href: "/company/operations",
        dedupeKey: `company:${input.companyId}:approved`,
      }, tx);
    }

    await tx.adminLog.create({
      data: {
        adminId: input.adminUserId,
        action: "COMPANY_APPROVE",
        targetType: "Company",
        targetId: input.companyId,
        metadata: { companyId: input.companyId },
      },
    });

    return updatedCompany;
  });
}

export async function rejectCompany(input: { adminUserId: string; companyId: string; reason?: string }) {
  await assertActiveAdmin(input.adminUserId);

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: input.companyId },
      select: {
        id: true,
        status: true,
        members: {
          where: { role: "OWNER", status: "ACTIVE" },
          select: { userId: true },
          take: 1,
        },
      },
    });
    if (!company) throw new Error("COMPANY_NOT_FOUND");
    if (company.status === "REJECTED") {
      return { id: company.id, status: company.status };
    }

    const { count } = await tx.company.updateMany({
      where: { id: input.companyId, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    if (count === 0) throw new Error("COMPANY_NOT_PENDING");

    const updatedCompany = { id: input.companyId, status: "REJECTED" as const };

    // Do not downgrade User.role

    const ownerMember = company.members?.[0];
    if (ownerMember) {
      await createInAppNotification({
        userId: ownerMember.userId,
        type: "ACTIVITY",
        title: "업체 등록 결과를 확인해 주세요",
        body: "업체 신청이 승인되지 않았습니다. 신청 화면에서 상태를 확인해 주세요.",
        href: "/company/apply",
        dedupeKey: `company:${input.companyId}:rejected`,
      }, tx);
    }

    await tx.adminLog.create({
      data: {
        adminId: input.adminUserId,
        action: "COMPANY_REJECT",
        targetType: "Company",
        targetId: input.companyId,
        metadata: input.reason ? { companyId: input.companyId, reason: input.reason } : { companyId: input.companyId },
      },
    });

    return updatedCompany;
  });
}
