import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { errorResponse, json, toApiError } from "@/lib/api/response";
import { uploadPostAttachments } from "@/lib/attachments/service";

type AttachmentRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: AttachmentRouteContext) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      throw validationError({ files: "파일을 1개 이상 첨부해 주세요." });
    }

    const attachments = await uploadPostAttachments(user, id, files);
    return json(attachments, { status: 201 });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}
