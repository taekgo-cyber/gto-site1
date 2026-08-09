import type { ApiUser } from "@/lib/api/auth";
import { forbidden, notFound, validationError } from "@/lib/api/errors";
import { getFileStorage } from "@/lib/storage";
import {
  countPostAttachments,
  createManyAttachmentRows,
  findAttachment,
  findPost,
  hasRepresentativeAttachment,
  listPostAttachments,
  promoteNextRepresentative,
  removeAttachmentRow,
  type PostAttachmentPublic,
} from "@/lib/posts/dal";
import type { AttachmentMediaType } from "@/generated/prisma/enums";
import {
  MAX_ATTACHMENTS_PER_POST,
  createStorageKey,
  validateUpload,
} from "./validation";

type AttachmentRowInput = {
  postId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  mediaType: AttachmentMediaType;
  sortOrder: number;
  isRepresentative: boolean;
};

export async function uploadPostAttachments(
  user: ApiUser,
  postId: string,
  files: File[],
): Promise<PostAttachmentPublic[]> {
  const post = await findPost(postId);
  if (!post || post.deletedAt !== null) throw notFound();
  if (post.authorId !== user.id) throw forbidden();

  const existingCount = await countPostAttachments(postId);
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_POST) {
    throw validationError({
      files: `게시글당 첨부파일은 최대 ${MAX_ATTACHMENTS_PER_POST}개까지 허용됩니다.`,
    });
  }

  const validated = [];
  for (const file of files) {
    validated.push(await validateUpload(file));
  }

  const hasRepresentative = await hasRepresentativeAttachment(postId);
  let representativeAssigned = hasRepresentative;

  const storage = getFileStorage();
  const savedKeys: string[] = [];

  try {
    const rows: AttachmentRowInput[] = [];
    let sortOrder = existingCount;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const info = validated[index];
      const storageKey = createStorageKey(postId, info.ext);
      const data = Buffer.from(await file.arrayBuffer());
      await storage.put(storageKey, data, info.mimeType);
      savedKeys.push(storageKey);

      const isRepresentative =
        !representativeAssigned && info.mediaType === "IMAGE";
      if (isRepresentative) representativeAssigned = true;

      rows.push({
        postId,
        storageKey,
        originalName: info.originalName,
        mimeType: info.mimeType,
        fileSize: info.fileSize,
        mediaType: info.mediaType,
        sortOrder,
        isRepresentative,
      });
      sortOrder += 1;
    }

    await createManyAttachmentRows(rows);
  } catch (error) {
    for (const key of savedKeys) {
      await storage.delete(key).catch(() => undefined);
    }
    throw error;
  }

  return listPostAttachments(postId);
}

export async function deletePostAttachment(
  user: ApiUser,
  postId: string,
  attachmentId: string,
): Promise<{ id: string }> {
  const post = await findPost(postId);
  if (!post || post.deletedAt !== null) throw notFound();
  if (post.authorId !== user.id) throw forbidden();

  const attachment = await findAttachment(attachmentId);
  if (!attachment || attachment.postId !== postId) {
    throw notFound("첨부파일을 찾을 수 없습니다.");
  }

  if (attachment.isRepresentative) {
    await promoteNextRepresentative(postId, attachmentId);
  }

  const storage = getFileStorage();
  await storage.delete(attachment.storageKey).catch(() => undefined);
  await removeAttachmentRow(attachmentId);

  return { id: attachmentId };
}
