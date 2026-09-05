import { requireApiUser } from "@/lib/api/auth";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { errorResponse, json, toApiError } from "@/lib/api/response";
import { resolveLeadPolicy } from "@/lib/leads/constants";
import { readUnlockedLeadContact, unlockLeadContact } from "@/lib/leads/service";
import { assertLaunchOperationsAvailable, resolveRuntimeLaunchPolicy } from "@/lib/launch/policy";
import { logOperationalError } from "@/lib/observability/logger";
import {
  enforceRequestRateLimit,
  rateLimitResponse,
  SECURITY_RATE_LIMITS,
  SecurityRateLimitError,
} from "@/lib/security/rate-limit";

function mapError(error: unknown) {
  if (error instanceof Error && /not unlocked/i.test(error.message)) return notFound("연락처가 아직 unlock되지 않았습니다.");
  if (error instanceof Error && /Forbidden|not active|Not a company member|Company not active|User not active|LeadMatch required/.test(error.message)) return forbidden();
  if (error instanceof Error && /not found/i.test(error.message)) return notFound("연락처를 찾을 수 없습니다.");
  return toApiError(error);
}

async function ids(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) throw badRequest("companyId가 필요합니다.");
  return { companyId, leadId: id };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { companyId, leadId } = await ids(request, context);
    await enforceRequestRateLimit({
      headers: request.headers,
      scope: "lead:contact-unlock",
      subject: user.id,
      policy: SECURITY_RATE_LIMITS.leadUnlock,
    });
    assertLaunchOperationsAvailable(resolveRuntimeLaunchPolicy());
    const result = await unlockLeadContact({ companyId, leadId, actorUserId: user.id, policy: resolveLeadPolicy() });
    return json({ contact: result.contact, alreadyUnlocked: result.alreadyUnlocked });
  } catch (error) {
    if (error instanceof SecurityRateLimitError) return rateLimitResponse(error);
    logOperationalError({
      operation: "lead_contact_unlock_api",
      actorType: "COMPANY",
      category: error instanceof Error && error.message.startsWith("LAUNCH_") ? "POLICY" : "UNEXPECTED",
      error,
      identifiers: { route: "/api/company/leads/unlock" },
    });
    return errorResponse(mapError(error));
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { companyId, leadId } = await ids(request, context);
    const result = await readUnlockedLeadContact({ companyId, leadId, actorUserId: user.id });
    return json({ contact: result.contact });
  } catch (error) {
    return errorResponse(mapError(error));
  }
}
