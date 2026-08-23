import { requireApiUser } from "@/lib/api/auth";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { errorResponse, json, toApiError } from "@/lib/api/response";
import { getDiscoverableLeadDetail } from "@/lib/leads/discovery";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId) throw badRequest("companyId가 필요합니다.");
    return json(await getDiscoverableLeadDetail({ actorUserId: user.id, companyId, leadId: id }));
  } catch (error) {
    if (error instanceof Error && /Forbidden|not active|Not a company member|Company not active|User not active/.test(error.message)) return errorResponse(forbidden());
    if (error instanceof Error && /not found/i.test(error.message)) return errorResponse(notFound("구직정보를 찾을 수 없습니다."));
    return errorResponse(toApiError(error));
  }
}
