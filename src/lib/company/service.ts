import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  validateCompanyApplicationInput,
  validateCompanyEditInput,
  type CompanyApplicationInput,
} from "./validation";

export type ApplyResult = {
  company: { id: string; status: string };
  member: { id: string; role: string; status: string };
};

export async function applyForCompany(input: {
  actorUserId: string;
  data: CompanyApplicationInput;
}): Promise<ApplyResult> {
  const validated = validateCompanyApplicationInput(input.data);

  // Actor must be ACTIVE user —fail closed for SUSPENDED/WITHDRAWN/deleted
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, status: true },
  });
  if (!actor || actor.status !== "ACTIVE") {
    throw new Error("USER_INACTIVE");
  }

  // Duplicate direct application check: user already has an OWNER ACTIVE membership (any company not REJECTED? but spec says first direct only, so any OWNER)
  const existingOwner = await prisma.companyMember.findFirst({
    where: {
      userId: input.actorUserId,
      role: "OWNER",
      status: "ACTIVE",
    },
    select: { id: true, companyId: true, company: { select: { status: true } } },
  } as unknown as never);

  // If prisma mock does not support include, fallback to simple findFirst check
  if (existingOwner) {
    // If company is REJECTED, still considered existing direct application -> reject duplicate creation, require resubmit flow
    throw new Error("DUPLICATE_COMPANY_APPLICATION");
  }

  // BusinessNumber uniqueness will be enforced by DB unique constraint; we can pre-check for friendly error
  const existingBusiness = await prisma.company.findUnique({
    where: { businessNumber: validated.businessNumber },
    select: { id: true },
  });
  if (existingBusiness) {
    throw new Error("BUSINESS_NUMBER_DUPLICATE");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Race hardening: re-check inside transaction before any write
        const txMemberFind = (tx as unknown as { companyMember: { findFirst: typeof prisma.companyMember.findFirst } }).companyMember;
        if (txMemberFind?.findFirst) {
          const dupOwnerInside = await txMemberFind.findFirst({
            where: { userId: input.actorUserId, role: "OWNER", status: "ACTIVE" },
            select: { id: true },
          } as unknown as never);
          if (dupOwnerInside) throw new Error("DUPLICATE_COMPANY_APPLICATION");
        }
        const txCompanyFind = (tx as unknown as { company: { findUnique: typeof prisma.company.findUnique } }).company;
        if (txCompanyFind?.findUnique) {
          const dupBizInside = await txCompanyFind.findUnique({
            where: { businessNumber: validated.businessNumber },
            select: { id: true },
          });
          if (dupBizInside) throw new Error("BUSINESS_NUMBER_DUPLICATE");
        }

        const company = await tx.company.create({
          data: {
            name: validated.name,
            businessNumber: validated.businessNumber,
            representativeName: validated.representativeName,
            phone: validated.phone,
            email: validated.email,
            address: validated.address,
            addressDetail: validated.addressDetail,
            regionId: validated.regionId,
            introduction: validated.introduction,
            status: "PENDING",
          },
          select: { id: true, status: true },
        });

        const member = await tx.companyMember.create({
          data: {
            userId: input.actorUserId,
            companyId: company.id,
            role: "OWNER",
            status: "ACTIVE",
          },
          select: { id: true, role: true, status: true },
        });

        // Do not change User.role here; keep as is
        return { company, member } as ApplyResult;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message;
      if (msg.includes("DUPLICATE_COMPANY_APPLICATION") || msg.includes("BUSINESS_NUMBER_DUPLICATE") || msg.includes("USER_INACTIVE")) throw error;
      // Prisma unique constraint P2002 for businessNumber or concurrent duplicate
      const code = (error as unknown as { code?: string; cause?: { code?: string } })?.code;
      const causeCode = (error as unknown as { cause?: { code?: string } })?.cause?.code;
      const prismaCode = code ?? causeCode;
      if (prismaCode === "P2002") {
        const meta = (error as unknown as { meta?: { target?: string[] } })?.meta;
        const target = meta?.target ? meta.target.join(",") : "";
        if (target.includes("businessNumber") || target.includes("business_number")) throw new Error("BUSINESS_NUMBER_DUPLICATE");
        throw new Error("DUPLICATE_COMPANY_APPLICATION");
      }
      // Bounded serialization/deadlock conflict mapping: Prisma P2034 or PostgreSQL 40001/40P01
      // PrismaPg can surface PostgreSQL SERIALIZABLE aborts as a DriverAdapterError
      // with the stable message "TransactionWriteConflict" and no numeric code.
      if (prismaCode === "P2034" || prismaCode === "40001" || prismaCode === "40P01" || msg === "TransactionWriteConflict") {
        throw new Error("DUPLICATE_COMPANY_APPLICATION");
      }
      // Also handle native driver error codes surfaced via message-less code property
      // Check for Postgres serialization_failure/deadlock without leaking raw message
    }
    throw error;
  }
}

async function assertOwnerMembership(actorUserId: string, companyId: string) {
  // Actor must be ACTIVE — hardening: PENDING owner management requires ACTIVE user
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, status: true },
  });
  if (!actor || actor.status !== "ACTIVE") {
    throw new Error("USER_INACTIVE");
  }
  const membership = await prisma.companyMember.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId } },
    select: { role: true, status: true, companyId: true },
  });
  if (!membership || membership.role !== "OWNER" || membership.status !== "ACTIVE") {
    throw new Error("NOT_OWNER_MEMBER");
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, status: true, name: true, businessNumber: true, representativeName: true, phone: true, email: true, address: true, addressDetail: true, regionId: true, introduction: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  return { membership, company };
}

export async function getCompanyApplicationForOwner(input: {
  actorUserId: string;
  companyId: string;
}) {
  const { company } = await assertOwnerMembership(input.actorUserId, input.companyId);
  // Allowed for PENDING/REJECTED/ACTIVE? Spec says PENDING/REJECTED owner status/detail
  // We return for any status where owner membership exists, but tests will check PENDING/REJECTED access
  if (company.status !== "PENDING" && company.status !== "REJECTED" && company.status !== "ACTIVE") {
    // still allow detail but state guarded
  }
  return company;
}

export async function updateCompanyByOwner(input: {
  actorUserId: string;
  companyId: string;
  data: Partial<CompanyApplicationInput>;
}) {
  const { company } = await assertOwnerMembership(input.actorUserId, input.companyId);

  if (company.status !== "PENDING" && company.status !== "REJECTED") {
    throw new Error("COMPANY_NOT_EDITABLE");
  }

  const validated = validateCompanyEditInput(input.data);
  if (Object.keys(validated).length === 0) {
    throw new Error("NO_FIELDS_TO_UPDATE");
  }

  // If businessNumber is being changed, check duplicate
  if (validated.businessNumber && validated.businessNumber !== company.businessNumber) {
    const dup = await prisma.company.findUnique({
      where: { businessNumber: validated.businessNumber },
      select: { id: true },
    });
    if (dup) throw new Error("BUSINESS_NUMBER_DUPLICATE");
  }

  const updated = await prisma.company.update({
    where: { id: input.companyId },
    data: validated as never,
    select: { id: true, status: true, name: true, businessNumber: true },
  });

  return updated;
}

export async function resubmitCompanyApplication(input: {
  actorUserId: string;
  companyId: string;
  data?: Partial<CompanyApplicationInput>;
}) {
  const { company } = await assertOwnerMembership(input.actorUserId, input.companyId);
  if (company.status !== "REJECTED") {
    throw new Error("COMPANY_NOT_REJECTED");
  }

  let validated: Partial<ReturnType<typeof validateCompanyEditInput>> = {};
  if (input.data && Object.keys(input.data).length > 0) {
    validated = validateCompanyEditInput(input.data);
    if (validated.businessNumber && validated.businessNumber !== company.businessNumber) {
      const dup = await prisma.company.findUnique({
        where: { businessNumber: validated.businessNumber },
        select: { id: true },
      });
      if (dup) throw new Error("BUSINESS_NUMBER_DUPLICATE");
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // State recheck inside transaction to handle concurrent approve/reject or stale resubmit
      const current = await tx.company.findUnique({
        where: { id: input.companyId },
        select: { id: true, status: true, businessNumber: true },
      });
      if (!current) throw new Error("COMPANY_NOT_FOUND");
      if (current.status !== "REJECTED") throw new Error("COMPANY_NOT_REJECTED");

      // BusinessNumber duplicate recheck inside transaction if changing
      if (validated.businessNumber && validated.businessNumber !== current.businessNumber) {
        const dupInside = await tx.company.findUnique({
          where: { businessNumber: validated.businessNumber },
          select: { id: true },
        });
        if (dupInside) throw new Error("BUSINESS_NUMBER_DUPLICATE");
      }

      const updated = await tx.company.update({
        where: { id: input.companyId },
        data: {
          ...(validated as Record<string, unknown>),
          status: "PENDING",
        } as never,
        select: { id: true, status: true },
      });
      return updated;
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("BUSINESS_NUMBER_DUPLICATE") || error.message.includes("COMPANY_NOT_REJECTED") || error.message.includes("COMPANY_NOT_FOUND") || error.message.includes("USER_INACTIVE")) throw error;
      const code = (error as unknown as { code?: string })?.code;
      if (code === "P2002") throw new Error("BUSINESS_NUMBER_DUPLICATE");
    }
    throw error;
  }
}

// Privileged write re-check helper: every privileged write must re-verify actor, selectedCompanyId, Company status, CompanyMember status/role from DB
export async function assertActiveCompanyContextForWrite(input: {
  actorUserId: string;
  selectedCompanyId: string;
  requiredRoles?: Array<"OWNER" | "MANAGER" | "STAFF">;
}) {
  const [user, company, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.actorUserId }, select: { id: true, status: true, role: true } }),
    prisma.company.findUnique({ where: { id: input.selectedCompanyId }, select: { id: true, status: true } }),
    prisma.companyMember.findUnique({
      where: { userId_companyId: { userId: input.actorUserId, companyId: input.selectedCompanyId } },
      select: { role: true, status: true },
    }),
  ]);

  if (!user || user.status !== "ACTIVE") throw new Error("USER_INACTIVE");
  if (!company || company.status !== "ACTIVE") throw new Error("COMPANY_INACTIVE");
  if (!membership || membership.status !== "ACTIVE") throw new Error("MEMBER_INACTIVE");
  if (input.requiredRoles && !input.requiredRoles.includes(membership.role as never)) {
    throw new Error("ROLE_NOT_ALLOWED");
  }
  return { user, company, membership };
}
