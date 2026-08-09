import { getApiUser } from "@/lib/api/auth";
import { errorResponse, toApiError } from "@/lib/api/response";
import { getFileStorage } from "@/lib/storage";
import { findAttachment, findPost } from "@/lib/posts/dal";
import { notFound } from "@/lib/api/errors";

type FileRouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

const IMAGE_CACHE = "public, max-age=31536000, immutable";
const DOCUMENT_CACHE = "private, no-cache";

/**
 * 첨부파일을 서빙한다. (로컬 디스크 스토리지 기반 개발용)
 *
 * 보안 규칙:
 * - storageKey는 클라이언트로부터 받지 않고 DB(attachment)에서 조회한다.
 * - attachment가 해당 게시글(postId)에 속하고, 삭제되지 않았어야 한다.
 * - 게시글이 PUBLISHED 상태이거나, 요청자가 게시글 작성자일 때만 접근을 허용한다.
 *
 * 주의: 운영 환경에서는 S3/서명 URL/CDN으로 대체해야 한다. (Session 6 보고 항목)
 */
export async function GET(_request: Request, context: FileRouteContext) {
  try {
    const { id, attachmentId } = await context.params;

    const post = await findPost(id);
    if (!post || post.deletedAt !== null) throw notFound();

    const attachment = await findAttachment(attachmentId);
    if (!attachment || attachment.postId !== id) {
      throw notFound("첨부파일을 찾을 수 없습니다.");
    }

    const user = await getApiUser();
    const isOwner = user !== null && user.id === post.authorId;
    if (post.status !== "PUBLISHED" && !isOwner) {
      throw notFound();
    }

    const storage = getFileStorage();
    const data = await storage.get(attachment.storageKey);

    const headers = new Headers();
    headers.set("Content-Type", attachment.mimeType);
    headers.set("Content-Length", String(data.byteLength));
    headers.set("Cache-Control", attachment.mediaType === "IMAGE" ? IMAGE_CACHE : DOCUMENT_CACHE);

    if (attachment.mediaType === "IMAGE") {
      headers.set("Content-Disposition", "inline");
    } else {
      headers.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      );
    }

    return new Response(new Uint8Array(data), { status: 200, headers });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}
