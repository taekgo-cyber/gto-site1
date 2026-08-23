import type { CompanyMembership } from "@/lib/auth/dal";

export type ResolveActiveCompanyResult =
  | { companyId: string; autoSelected: boolean }
  | { companyId: null; requireSelection: true }
  | { companyId: null; requireSelection?: false };

export function filterActiveMemberships(memberships: CompanyMembership[]): CompanyMembership[] {
  return memberships.filter(
    (m) => m.companyStatus === "ACTIVE" && m.status === "ACTIVE",
  );
}

export function resolveActiveCompanyId(input: {
  memberships: CompanyMembership[];
  selectedCompanyId?: string | null;
}): ResolveActiveCompanyResult {
  const active = filterActiveMemberships(input.memberships);

  if (active.length === 0) {
    return { companyId: null };
  }

  if (active.length === 1) {
    const sole = active[0]!;
    if (!input.selectedCompanyId) {
      return { companyId: sole.companyId, autoSelected: true };
    }
    const match = active.find((m) => m.companyId === input.selectedCompanyId);
    if (!match) {
      // tampering: selected not in active memberships
      throw new Error("COMPANY_CONTEXT_MISMATCH");
    }
    return { companyId: match.companyId, autoSelected: false };
  }

  // two or more
  if (!input.selectedCompanyId) {
    return { companyId: null, requireSelection: true };
  }
  const match = active.find((m) => m.companyId === input.selectedCompanyId);
  if (!match) {
    throw new Error("COMPANY_CONTEXT_MISMATCH");
  }
  return { companyId: match.companyId, autoSelected: false };
}

export function assertSelectedCompanyNotTampered(input: {
  actorUserId: string;
  selectedCompanyId: string;
  memberships: CompanyMembership[];
}): void {
  const found = input.memberships.find(
    (m) => m.companyId === input.selectedCompanyId && m.status === "ACTIVE",
  );
  if (!found) throw new Error("COMPANY_CONTEXT_MISMATCH");
}
