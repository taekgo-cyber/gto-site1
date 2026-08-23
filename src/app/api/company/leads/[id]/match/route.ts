import { requireApiUser } from "@/lib/api/auth";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { errorResponse, json, parseJsonBody, toApiError } from "@/lib/api/response";
import { cancelLeadMatch, createLeadMatch } from "@/lib/leads/service";

function mapError(error: unknown) {
  if (error instanceof Error && /Forbidden|not active|Not a company member|Company not active|User not active|STAFF/.test(error.message)) return forbidden();
  if (error instanceof Error && /not found/i.test(error.message)) return notFound("매칭 대상을 찾을 수 없습니다.");
  return toApiError(error);
}

async function ids(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = request.method === "POST" ? await parseJsonBody<{ companyId?: unknown }>(request) : {};
  const companyId = new URL(request.url).searchParams.get("companyId") ?? (typeof body.companyId === "string" ? body.companyId : null);
  if (!companyId) throw badRequest("companyId가 필요합니다.");
  return { leadId: id, companyId };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { companyId, leadId } = await ids(request, context);
    return json(await createLeadMatch({ companyId, leadId, actorUserId: user.id }), { status: 201 });
  } catch (error) {
    return errorResponse(mapError(error));
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { companyId, leadId } = await ids(request, context);
    return json(await cancelLeadMatch({ companyId, leadId, actorUserId: user.id }));
  } catch (error) {
    return errorResponse(mapError(error));
  }
}
