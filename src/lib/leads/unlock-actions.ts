"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { resolveLeadPolicy } from "./constants";
import { unlockLeadContact } from "./service";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function unlockCompanyLeadContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = required(formData, "companyId");
  const leadId = required(formData, "leadId");
  if (!companyId || !leadId) redirect("/company/leads?unlockError=1");

  try {
    await unlockLeadContact({
      companyId,
      leadId,
      actorUserId: user.id,
      policy: resolveLeadPolicy(),
    });
  } catch {
    // Never expose authorization, policy, database, or stack details through a Server Action.
    redirect(`/company/leads?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}&unlockError=1`);
  }
  redirect(`/company/leads?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}`);
}
