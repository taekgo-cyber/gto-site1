"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { cancelLeadMatch, createLeadMatch } from "./service";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createCompanyLeadMatch(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = required(formData, "companyId");
  const leadId = required(formData, "leadId");
  if (!companyId || !leadId) throw new Error("companyId and leadId are required");

  await createLeadMatch({ companyId, leadId, actorUserId: user.id });
  redirect(`/company/leads?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}`);
}

export async function cancelCompanyLeadMatch(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = required(formData, "companyId");
  const leadId = required(formData, "leadId");
  if (!companyId || !leadId) throw new Error("companyId and leadId are required");

  await cancelLeadMatch({ companyId, leadId, actorUserId: user.id });
  redirect(`/company/leads?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}`);
}
