import { prisma } from "@/lib/prisma";
import type { ApiUser } from "@/lib/api/auth";
import { forbidden, notFound, validationError } from "@/lib/api/errors";
import {
  parseCreateInput,
  parseUpdateInput,
  type PostFieldErrors,
  type PostUpdateInput,
} from "./validation";
import {
  createPostRow,
  findPost,
  incrementPostView,
  softDeletePostAttachments,
  softDeletePostRow,
  updatePostRow,
  type PostAttachmentPublic,
  type PostRecord,
} from "./dal";
import type { Prisma } from "@/generated/prisma/client";

export type PostPublic = {
  id: string;
  type: PostRecord["type"];
  title: string;
  content: string;
  status: PostRecord["status"];
  viewCount: number;
  regionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
  payType: PostRecord["payType"];
  payAmount: number | null;
  workType: PostRecord["workType"];
  conditions: Prisma.JsonValue | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; nickname: string | null };
  attachments: PostAttachmentPublic[];
};

function toPublicPost(record: PostRecord): PostPublic {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    content: record.content,
    status: record.status,
    viewCount: record.viewCount,
    regionName: record.regionName,
    vehicleTypeName: record.vehicleTypeName,
    tonnageName: record.tonnageName,
    payType: record.payType,
    payAmount: record.payAmount,
    workType: record.workType,
    conditions: record.conditions,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    author: record.author,
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      mediaType: attachment.mediaType,
      sortOrder: attachment.sortOrder,
      isRepresentative: attachment.isRepresentative,
      createdAt: attachment.createdAt,
    })),
  };
}

async function ensureMasterDataExists(input: {
  regionId?: string | null;
  vehicleTypeId?: string | null;
  tonnageId?: string | null;
}): Promise<PostFieldErrors> {
  const errors: PostFieldErrors = {};

  if (input.regionId) {
    const region = await prisma.region.findUnique({
      where: { id: input.regionId },
      select: { id: true },
    });
    if (!region) errors.regionId = "존재하지 않는 지역입니다.";
  }
  if (input.vehicleTypeId) {
    const vehicleType = await prisma.vehicleType.findUnique({
      where: { id: input.vehicleTypeId },
      select: { id: true },
    });
    if (!vehicleType) errors.vehicleTypeId = "존재하지 않는 차종입니다.";
  }
  if (input.tonnageId) {
    const tonnage = await prisma.tonnage.findUnique({
      where: { id: input.tonnageId },
      select: { id: true },
    });
    if (!tonnage) errors.tonnageId = "존재하지 않는 톤수입니다.";
  }

  return errors;
}

export async function createPost(
  user: ApiUser,
  raw: Record<string, unknown>,
): Promise<PostPublic> {
  const { data, errors } = parseCreateInput(raw);
  if (!data) throw validationError(errors);

  const masterErrors = await ensureMasterDataExists(data);
  if (Object.keys(masterErrors).length > 0) throw validationError(masterErrors);

  const publishedAt = data.status === "PUBLISHED" ? new Date() : null;
  const record = await createPostRow({
    ...data,
    authorId: user.id,
    publishedAt,
  });

  return toPublicPost(record);
}

export async function getPostDetail(
  user: ApiUser | null,
  id: string,
  options: { recordView?: boolean } = {},
): Promise<PostPublic> {
  const record = await findPost(id);
  if (!record || record.deletedAt !== null) throw notFound();

  const isOwner = user !== null && user.id === record.authorId;
  if (record.status !== "PUBLISHED" && !isOwner) throw notFound();

  if (record.status === "PUBLISHED" && options.recordView !== false) {
    await incrementPostView(id);
  }

  return toPublicPost(record);
}

export async function updatePost(
  user: ApiUser,
  id: string,
  raw: Record<string, unknown>,
): Promise<PostPublic> {
  const record = await findPost(id);
  if (!record || record.deletedAt !== null) throw notFound();
  if (record.authorId !== user.id) throw forbidden();

  const { data, errors } = parseUpdateInput(raw);
  if (!data) throw validationError(errors);

  const masterErrors = await ensureMasterDataExists(data);
  if (Object.keys(masterErrors).length > 0) throw validationError(masterErrors);

  const patch: PostUpdateInput & { publishedAt?: Date } = { ...data };
  if (data.status === "PUBLISHED" && record.publishedAt === null) {
    patch.publishedAt = new Date();
  }

  const updated = await updatePostRow(id, patch);
  return toPublicPost(updated);
}

export async function deletePost(
  user: ApiUser,
  id: string,
): Promise<{ id: string }> {
  const record = await findPost(id);
  if (!record || record.deletedAt !== null) throw notFound();
  if (record.authorId !== user.id) throw forbidden();

  await softDeletePostRow(id);
  await softDeletePostAttachments(id);

  return { id };
}
