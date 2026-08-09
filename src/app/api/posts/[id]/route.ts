import { getApiUser, requireApiUser } from "@/lib/api/auth";
import { errorResponse, json, parseJsonBody, toApiError } from "@/lib/api/response";
import { deletePost, getPostDetail, updatePost } from "@/lib/posts/service";

type PostRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: PostRouteContext) {
  try {
    const { id } = await context.params;
    const user = await getApiUser();
    const post = await getPostDetail(user, id);
    return json(post);
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

export async function PATCH(request: Request, context: PostRouteContext) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await parseJsonBody<Record<string, unknown>>(request);
    const post = await updatePost(user, id, body);
    return json(post);
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

export async function DELETE(_request: Request, context: PostRouteContext) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const result = await deletePost(user, id);
    return json(result);
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}
