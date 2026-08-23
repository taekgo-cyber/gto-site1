import { requireApiUser } from "@/lib/api/auth";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { errorResponse, json, toApiError } from "@/lib/api/response";
import { discoverCandidateLeads } from "@/lib/leads/discovery";
import { parseLeadDiscoveryQuery } from "@/lib/leads/discovery-validation";

function leadApiError(error: unknown) {
  if (error instanceof Error && /Forbidden|not active|Not a company member|Company not active|User not active/.test(error.message)) {
    return forbidden();
  }
  if (error instanceof Error && /not found/i.test(error.message)) return notFound("구직정보를 찾을 수 없습니다.");
  return toApiError(error);
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = parseLeadDiscoveryQuery(new URL(request.url).searchParams);
    if (!query.companyId) throw badRequest("companyId가 필요합니다.");
    const result = await discoverCandidateLeads({
      actorUserId: user.id,
      companyId: query.companyId,
      page: query.page,
      pageSize: query.pageSize,
      filters: query.filters,
    });
    return json(result);
  } catch (error) {
    return errorResponse(leadApiError(error));
  }
}
