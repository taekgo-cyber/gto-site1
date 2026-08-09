import type { CompanyMemberRole, UserRole } from "@/generated/prisma/enums";

const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: "일반 회원",
  COMPANY: "업체 회원",
  ADMIN: "관리자",
};

const COMPANY_MEMBER_ROLE_LABELS: Record<CompanyMemberRole, string> = {
  OWNER: "대표",
  MANAGER: "관리자",
  STAFF: "직원",
};

export function userRoleLabel(role: UserRole): string {
  return USER_ROLE_LABELS[role];
}

export function companyMemberRoleLabel(role: CompanyMemberRole): string {
  return COMPANY_MEMBER_ROLE_LABELS[role];
}
