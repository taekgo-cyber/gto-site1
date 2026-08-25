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
