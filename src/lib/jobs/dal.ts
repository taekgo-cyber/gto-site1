import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { JobPostType } from "@/generated/prisma/enums";

export type RegionOption = {
  id: string;
  name: string;
  children: Array<{ id: string; name: string }>;
};

export type MasterData = {
  regions: RegionOption[];
};

export type JobPostListItem = {
  id: string;
  type: JobPostType;
  title: string;
  payType: "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE" | null;
  payAmount: number | null;
  workType:
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "DAILY"
    | "FREELANCE"
    | null;
  deadline: Date | null;
  viewCount: number;
  publishedAt: Date | null;
  companyName: string | null;
  originRegionName: string | null;
  destRegionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
};

export type JobPostListResult = {
  items: JobPostListItem[];
  totalCount: number;
};

export type JobPostDetail = {
  id: string;
  type: JobPostType;
  title: string;
  description: string | null;
  originAddress: string | null;
  destAddress: string | null;
  payType: "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE" | null;
  payAmount: number | null;
  workType:
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "DAILY"
    | "FREELANCE"
    | null;
  workDescription: string | null;
  deadline: Date | null;
  publishedAt: Date | null;
  viewCount: number;
  status: "DRAFT" | "OPEN" | "CLOSED" | "HIDDEN";
  companyName: string | null;
  companyPhone: string | null;
  authorName: string | null;
  originRegionName: string | null;
  destRegionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
};

const LIST_PAGE_SIZE = 10;

export const getMasterData = cache(async (): Promise<MasterData> => {
  const regions = await prisma.region.findMany({
    where: { isActive: true },
    select: { id: true, name: true, depth: true, parentId: true },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });

  const provinces = regions.filter((region) => region.depth === 1);
  const regionOptions: RegionOption[] = provinces.map((province) => ({
    id: province.id,
    name: province.name,
    children: regions
      .filter((region) => region.parentId === province.id)
      .map((region) => ({ id: region.id, name: region.name })),
  }));

  return { regions: regionOptions };
});

export const getJobPostList = cache(
  async (input: {
    type?: JobPostType;
    regionId?: string;
    keyword?: string;
    page?: number;
    excludeIds?: string[];
  }): Promise<JobPostListResult> => {
    const { type, regionId, keyword, page = 1, excludeIds = [] } = input;
    const skip = (page - 1) * LIST_PAGE_SIZE;

    const where = await buildJobPostListWhere({ type, regionId, keyword });
    if (excludeIds.length > 0) where.id = { notIn: [...new Set(excludeIds)] };

    const [items, totalCount] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        select: {
          id: true,
          type: true,
          title: true,
          payType: true,
          payAmount: true,
          workType: true,
          deadline: true,
          viewCount: true,
          publishedAt: true,
          company: { select: { name: true } },
          originRegion: { select: { name: true } },
          destRegion: { select: { name: true } },
          vehicleType: { select: { name: true } },
          tonnage: { select: { name: true } },
        },
        orderBy: { publishedAt: "desc" },
        skip,
        take: LIST_PAGE_SIZE,
      }),
      prisma.jobPost.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        payType: item.payType,
        payAmount: item.payAmount,
        workType: item.workType,
        deadline: item.deadline,
        viewCount: item.viewCount,
        publishedAt: item.publishedAt,
        companyName: item.company?.name ?? null,
        originRegionName: item.originRegion?.name ?? null,
        destRegionName: item.destRegion?.name ?? null,
        vehicleTypeName: item.vehicleType?.name ?? null,
        tonnageName: item.tonnage?.name ?? null,
      })),
      totalCount,
    };
  },
);

async function buildJobPostListWhere(input: {
  type?: JobPostType;
  regionId?: string;
  keyword?: string;
}) {
  const { type, regionId, keyword } = input;

  const where: Prisma.JobPostWhereInput = {
    status: "OPEN",
    deletedAt: null,
    publishedAt: { not: null },
  };

  if (type) where.type = type;

  if (keyword && keyword.trim()) {
    where.OR = [
      { title: { contains: keyword.trim(), mode: "insensitive" } },
      { description: { contains: keyword.trim(), mode: "insensitive" } },
    ];
  }

  if (regionId) {
    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true, depth: true },
    });

    if (region) {
      if (region.depth === 1) {
        const children = await prisma.region.findMany({
          where: { parentId: region.id },
          select: { id: true },
        });
        where.originRegionId = {
          in: [region.id, ...children.map((child) => child.id)],
        };
      } else {
        where.originRegionId = region.id;
      }
    }
  }

  return where;
}

export async function getJobPostById(id: string): Promise<JobPostDetail | null> {
  const post = await prisma.jobPost.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      originAddress: true,
      destAddress: true,
      payType: true,
      payAmount: true,
      workType: true,
      workDescription: true,
      deadline: true,
      publishedAt: true,
      viewCount: true,
      status: true,
      company: { select: { name: true, phone: true } },
      author: { select: { nickname: true, name: true } },
      originRegion: { select: { name: true } },
      destRegion: { select: { name: true } },
      vehicleType: { select: { name: true } },
      tonnage: { select: { name: true } },
    },
  });

  if (!post) return null;

  return {
    id: post.id,
    type: post.type,
    title: post.title,
    description: post.description,
    originAddress: post.originAddress,
    destAddress: post.destAddress,
    payType: post.payType,
    payAmount: post.payAmount,
    workType: post.workType,
    workDescription: post.workDescription,
    deadline: post.deadline,
    publishedAt: post.publishedAt,
    viewCount: post.viewCount,
    status: post.status,
    companyName: post.company?.name ?? null,
    companyPhone: post.company?.phone ?? null,
    authorName: post.author?.nickname ?? post.author?.name ?? null,
    originRegionName: post.originRegion?.name ?? null,
    destRegionName: post.destRegion?.name ?? null,
    vehicleTypeName: post.vehicleType?.name ?? null,
    tonnageName: post.tonnage?.name ?? null,
  };
}

export function getListPageSize(): number {
  return LIST_PAGE_SIZE;
}
