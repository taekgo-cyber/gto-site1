import type { CompanyActor } from "./types";
import { prisma } from "@/lib/prisma";

export type CompanyActorInput = {
  userId: string;
  userStatus: string;
  userRole: string;
  companyId: string;
  memberRole: string | null;
  memberStatus: string | null;
  companyStatus: string | null;
};

export type AuthorizationResult =
  | { ok: true; actor: CompanyActor }
  | { ok: false; code: string; message: string };

export function validateCompanyActorForNormalEndpoint(input: CompanyActorInput): AuthorizationResult {
  // Spec: User.status ACTIVE, User.role COMPANY, active CompanyMember for requested companyId, CompanyMember.status ACTIVE, Company.status ACTIVE
  if (input.userStatus !== "ACTIVE") {
    return { ok: false, code: "USER_INACTIVE", message: "User not active" };
  }
  if (input.userRole !== "COMPANY") {
    return { ok: false, code: "ROLE_NOT_COMPANY", message: "User role must be COMPANY" };
  }
  if (!input.companyId) {
    return { ok: false, code: "COMPANY_REQUIRED", message: "companyId required" };
  }
  if (input.companyStatus !== "ACTIVE") {
    return { ok: false, code: "COMPANY_INACTIVE", message: "Company not active" };
  }
  if (!input.memberRole || !input.memberStatus) {
    return { ok: false, code: "NOT_MEMBER", message: "Not a company member" };
  }
  if (input.memberStatus !== "ACTIVE") {
    return { ok: false, code: "MEMBER_INACTIVE", message: "Membership not active" };
  }
  // valid
  return {
    ok: true,
    actor: {
      userId: input.userId,
      userStatus: "ACTIVE",
      userRole: "COMPANY",
      companyId: input.companyId,
      companyStatus: "ACTIVE",
      memberRole: input.memberRole as CompanyActor["memberRole"],
      memberStatus: "ACTIVE",
    },
  };
}

export function canDiscoverLead(actor: CompanyActor): boolean {
  // OWNER/MANAGER/STAFF all can discover if authorized above
  return ["OWNER", "MANAGER", "STAFF"].includes(actor.memberRole);
}

export function canMatchOrUnlock(actor: CompanyActor): boolean {
  return actor.memberRole === "OWNER" || actor.memberRole === "MANAGER";
}

// Derive and validate company context from actor session plus companyId; never trust client companyId alone.
// For Gate2 we expose a helper that validates that requestedCompanyId equals sessionCompanyId (or is among active memberships).
export function deriveAndValidateCompanyContext(
  sessionCompanyIds: string[],
  requestedCompanyId: string,
): { ok: true } | { ok: false; code: string } {
  if (!requestedCompanyId) return { ok: false, code: "COMPANY_REQUIRED" };
  if (!sessionCompanyIds.includes(requestedCompanyId)) {
    return { ok: false, code: "COMPANY_CONTEXT_MISMATCH" };
  }
  return { ok: true };
}

export async function resolveActiveCompanyActor(
  actorUserId: string,
  companyId: string,
): Promise<AuthorizationResult> {
  const [user, company, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, status: true, role: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true, status: true } }),
    prisma.companyMember.findUnique({
      where: { userId_companyId: { userId: actorUserId, companyId } },
      select: { role: true, status: true },
    }),
  ]);

  return validateCompanyActorForNormalEndpoint({
    userId: actorUserId,
    userStatus: user?.status ?? "WITHDRAWN",
    userRole: user?.role ?? "USER",
    companyId,
    companyStatus: company?.status ?? "REJECTED",
    memberRole: membership?.role ?? null,
    memberStatus: membership?.status ?? null,
  });
}
