import { requireApiUser } from "@/lib/api/auth";
import { errorResponse, json, toApiError } from "@/lib/api/response";
import { deletePostAttachment } from "@/lib/attachments/service";

type AttachmentItemRouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

export async function DELETE(_request: Request, context: AttachmentItemRouteContext) {
  try {
    const user = await requireApiUser();
    const { id, attachmentId } = await context.params;
    const result = await deletePostAttachment(user, id, attachmentId);
    return json(result);
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}
