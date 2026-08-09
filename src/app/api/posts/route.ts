import { requireApiUser } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { errorResponse, json, parseJsonBody, toApiError } from "@/lib/api/response";
import { getPostList } from "@/lib/posts/dal";
import { createPost } from "@/lib/posts/service";
import { parseListQuery } from "@/lib/posts/validation";

export async function GET(request: Request) {
  try {
    const { query, errors } = parseListQuery(new URL(request.url).searchParams);
    if (Object.keys(errors).length > 0) throw validationError(errors);

    const result = await getPostList(query);

    return json({
      items: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await parseJsonBody<Record<string, unknown>>(request);
    const post = await createPost(user, body);
    return json(post, { status: 201 });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}
