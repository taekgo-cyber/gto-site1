"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { assertLaunchOperationsAvailable, resolveRuntimeLaunchPolicy } from "@/lib/launch/policy";
import { logOperationalError } from "@/lib/observability/logger";
import { resolveLeadPolicy } from "./constants";
import { unlockLeadContact } from "./service";
import { enforceRequestRateLimit, SECURITY_RATE_LIMITS } from "@/lib/security/rate-limit";

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
    await enforceRequestRateLimit({
      headers: await headers(),
      scope: "lead:contact-unlock",
      subject: user.id,
      policy: SECURITY_RATE_LIMITS.leadUnlock,
    });
    assertLaunchOperationsAvailable(resolveRuntimeLaunchPolicy());
    await unlockLeadContact({
      companyId,
      leadId,
      actorUserId: user.id,
      policy: resolveLeadPolicy(),
    });
  } catch (error) {
    logOperationalError({
      operation: "lead_contact_unlock",
      actorType: "COMPANY",
      category: error instanceof Error && error.message.startsWith("LAUNCH_") ? "POLICY" : "UNEXPECTED",
      error,
      identifiers: { userId: user.id, companyId, leadId },
    });
    // Never expose authorization, policy, database, or stack details through a Server Action.
    redirect(`/company/leads?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}&unlockError=1`);
  }
  redirect(`/company/leads?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}`);
}
