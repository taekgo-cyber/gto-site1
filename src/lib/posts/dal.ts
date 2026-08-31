import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type {
  AttachmentMediaType,
  LeasePostStatus,
  LeasePostType,
  PayType,
  WorkType,
} from "@/generated/prisma/enums";
import type { PostCreateInput, PostListQuery, PostUpdateInput } from "./validation";

export type PostAttachmentRecord = {
  id: string;
  postId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  mediaType: AttachmentMediaType;
  sortOrder: number;
  isRepresentative: boolean;
  createdAt: Date;
};

export type PostAttachmentPublic = Omit<PostAttachmentRecord, "storageKey" | "postId">;

export type PostRecord = {
  id: string;
  type: LeasePostType;
  title: string;
  content: string;
  status: LeasePostStatus;
  viewCount: number;
  authorId: string;
  companyId: string | null;
  regionId: string | null;
  vehicleTypeId: string | null;
  tonnageId: string | null;
  payType: PayType | null;
  payAmount: number | null;
  workType: WorkType | null;
  conditions: Prisma.JsonValue | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; nickname: string | null };
  regionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
  attachments: PostAttachmentRecord[];
};

export type PostListItem = {
  id: string;
  type: LeasePostType;
  title: string;
  status: LeasePostStatus;
  viewCount: number;
  payType: PayType | null;
  payAmount: number | null;
  workType: WorkType | null;
  publishedAt: Date | null;
  regionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
  representativeImage: {
    id: string;
    mimeType: string;
    mediaType: AttachmentMediaType;
  } | null;
};

export type PostListResult = {
  items: PostListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PostRowCreateInput = PostCreateInput & {
  authorId: string;
  publishedAt: Date | null;
};

export type PostRowUpdateInput = PostUpdateInput & {
  publishedAt?: Date | null;
};

type PostRow = {
  id: string;
  type: LeasePostType;
  title: string;
  content: string;
  status: LeasePostStatus;
  viewCount: number;
  authorId: string;
  companyId: string | null;
  regionId: string | null;
  vehicleTypeId: string | null;
  tonnageId: string | null;
  payType: PayType | null;
  payAmount: number | null;
  workType: WorkType | null;
  conditions: Prisma.JsonValue | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; nickname: string | null };
  region: { name: string } | null;
  vehicleType: { name: string } | null;
  tonnage: { name: string } | null;
  attachments: Array<{
    id: string;
    postId: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    mediaType: AttachmentMediaType;
    sortOrder: number;
    isRepresentative: boolean;
    createdAt: Date;
  }>;
};

const POST_SELECT = {
  id: true,
  type: true,
  title: true,
  content: true,
  status: true,
  viewCount: true,
  authorId: true,
  companyId: true,
  regionId: true,
  vehicleTypeId: true,
  tonnageId: true,
  payType: true,
  payAmount: true,
  workType: true,
  conditions: true,
  publishedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, nickname: true } },
  region: { select: { name: true } },
  vehicleType: { select: { name: true } },
  tonnage: { select: { name: true } },
  attachments: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      postId: true,
      storageKey: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      mediaType: true,
      sortOrder: true,
      isRepresentative: true,
      createdAt: true,
    },
  },
} satisfies Prisma.LeasePostSelect;

const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  status: true,
  viewCount: true,
  payType: true,
  payAmount: true,
  workType: true,
  publishedAt: true,
  region: { select: { name: true } },
  vehicleType: { select: { name: true } },
  tonnage: { select: { name: true } },
  attachments: {
    where: { deletedAt: null, isRepresentative: true },
    orderBy: { sortOrder: "asc" },
    take: 1,
    select: { id: true, mimeType: true, mediaType: true },
  },
} satisfies Prisma.LeasePostSelect;

const ATTACHMENT_SELECT = {
  id: true,
  postId: true,
  storageKey: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  mediaType: true,
  sortOrder: true,
  isRepresentative: true,
  createdAt: true,
} satisfies Prisma.LeasePostAttachmentSelect;

function mapPost(post: PostRow): PostRecord {
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    content: post.content,
    status: post.status,
    viewCount: post.viewCount,
    authorId: post.authorId,
    companyId: post.companyId,
    regionId: post.regionId,
    vehicleTypeId: post.vehicleTypeId,
    tonnageId: post.tonnageId,
    payType: post.payType,
    payAmount: post.payAmount,
    workType: post.workType,
    conditions: post.conditions,
    publishedAt: post.publishedAt,
    deletedAt: post.deletedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: post.author,
    regionName: post.region?.name ?? null,
    vehicleTypeName: post.vehicleType?.name ?? null,
    tonnageName: post.tonnage?.name ?? null,
    attachments: post.attachments,
  };
}

export async function findPost(id: string): Promise<PostRecord | null> {
  const post = await prisma.leasePost.findUnique({
    where: { id },
    select: POST_SELECT,
  });
  if (!post) return null;
  return mapPost(post);
}

export async function getPostAuthorPhone(id: string): Promise<string | null> {
  const post = await prisma.leasePost.findUnique({
    where: { id },
    select: { author: { select: { phone: true } } },
  });
  return post?.author.phone ?? null;
}

export async function getPostList(
  query: PostListQuery,
  options: { excludeIds?: string[] } = {},
): Promise<PostListResult> {
  const where = buildListWhere(query);
  if (options.excludeIds?.length) {
    where.id = { notIn: [...new Set(options.excludeIds)] };
  }
  const skip = (query.page - 1) * query.pageSize;

  const [rows, totalCount] = await Promise.all([
    prisma.leasePost.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { publishedAt: "desc" },
      skip,
      take: query.pageSize,
    }),
    prisma.leasePost.count({ where }),
  ]);

  const items: PostListItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    viewCount: row.viewCount,
    payType: row.payType,
    payAmount: row.payAmount,
    workType: row.workType,
    publishedAt: row.publishedAt,
    regionName: row.region?.name ?? null,
    vehicleTypeName: row.vehicleType?.name ?? null,
    tonnageName: row.tonnage?.name ?? null,
    representativeImage: row.attachments[0] ?? null,
  }));

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / query.pageSize);

  return {
    items,
    totalCount,
    page: query.page,
    pageSize: query.pageSize,
    totalPages,
  };
}

function buildListWhere(query: PostListQuery): Prisma.LeasePostWhereInput {
  const where: Prisma.LeasePostWhereInput = {
    status: "PUBLISHED",
    deletedAt: null,
    publishedAt: { not: null },
  };

  if (query.type) where.type = query.type;
  if (query.regionId) where.regionId = query.regionId;
  if (query.vehicleTypeId) where.vehicleTypeId = query.vehicleTypeId;
  if (query.tonnageId) where.tonnageId = query.tonnageId;
  if (query.payType) where.payType = query.payType as PayType;

  if (query.keyword) {
    where.OR = [
      { title: { contains: query.keyword, mode: "insensitive" } },
      { content: { contains: query.keyword, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function createPostRow(input: PostRowCreateInput): Promise<PostRecord> {
  const post = await prisma.leasePost.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      status: input.status,
      authorId: input.authorId,
      regionId: input.regionId,
      vehicleTypeId: input.vehicleTypeId,
      tonnageId: input.tonnageId,
      payType: input.payType,
      payAmount: input.payAmount,
      workType: input.workType,
      conditions: input.conditions as Prisma.InputJsonValue | undefined,
      publishedAt: input.publishedAt,
    },
    select: POST_SELECT,
  });
  return mapPost(post);
}

export async function updatePostRow(id: string, input: PostRowUpdateInput): Promise<PostRecord> {
  const data = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.type !== undefined && { type: input.type }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.regionId !== undefined && { regionId: input.regionId }),
    ...(input.vehicleTypeId !== undefined && { vehicleTypeId: input.vehicleTypeId }),
    ...(input.tonnageId !== undefined && { tonnageId: input.tonnageId }),
    ...(input.payType !== undefined && { payType: input.payType }),
    ...(input.payAmount !== undefined && { payAmount: input.payAmount }),
    ...(input.workType !== undefined && { workType: input.workType }),
    ...(input.conditions !== undefined && {
      conditions: input.conditions as Prisma.InputJsonValue | null,
    }),
    ...(input.publishedAt !== undefined && { publishedAt: input.publishedAt }),
  } as Prisma.LeasePostUpdateInput;

  const post = await prisma.leasePost.update({
    where: { id },
    data,
    select: POST_SELECT,
  });
  return mapPost(post);
}

export async function softDeletePostRow(id: string): Promise<void> {
  await prisma.leasePost.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function incrementPostView(id: string): Promise<number> {
  const result = await prisma.leasePost.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });
  return result.viewCount;
}

export async function countPostAttachments(postId: string): Promise<number> {
  return prisma.leasePostAttachment.count({
    where: { postId, deletedAt: null },
  });
}

export async function hasRepresentativeAttachment(postId: string): Promise<boolean> {
  const row = await prisma.leasePostAttachment.findFirst({
    where: { postId, deletedAt: null, isRepresentative: true },
    select: { id: true },
  });
  return row !== null;
}

export async function listPostAttachments(postId: string): Promise<PostAttachmentPublic[]> {
  const rows = await prisma.leasePostAttachment.findMany({
    where: { postId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: ATTACHMENT_SELECT,
  });
  return rows.map((row) => ({
    id: row.id,
    postId: row.postId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    mediaType: row.mediaType,
    sortOrder: row.sortOrder,
    isRepresentative: row.isRepresentative,
    createdAt: row.createdAt,
  }));
}

export async function findAttachment(id: string): Promise<PostAttachmentRecord | null> {
  const row = await prisma.leasePostAttachment.findUnique({
    where: { id },
    select: ATTACHMENT_SELECT,
  });
  return row;
}

export async function createManyAttachmentRows(
  rows: Array<{
    postId: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    mediaType: AttachmentMediaType;
    sortOrder: number;
    isRepresentative: boolean;
  }>,
): Promise<void> {
  await prisma.leasePostAttachment.createMany({ data: rows });
}

export async function promoteNextRepresentative(postId: string, excludeId: string): Promise<void> {
  const next = await prisma.leasePostAttachment.findFirst({
    where: {
      postId,
      deletedAt: null,
      isRepresentative: false,
      mediaType: "IMAGE",
      id: { not: excludeId },
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!next) return;
  await prisma.leasePostAttachment.update({
    where: { id: next.id },
    data: { isRepresentative: true },
  });
}

export async function removeAttachmentRow(id: string): Promise<void> {
  await prisma.leasePostAttachment.delete({ where: { id } });
}

export async function softDeletePostAttachments(postId: string): Promise<void> {
  await prisma.leasePostAttachment.updateMany({
    where: { postId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}
