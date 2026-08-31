import { Prisma } from "@/generated/prisma/client";

/**
 * Gate 1 source contracts. These builders are intentionally execution-free:
 * Gate 2 can compose them into a DAL without widening the public projections.
 */
export const JOB_SEARCH_SELECT = {
  id: true,
  title: true,
  description: true,
  publishedAt: true,
  company: { select: { name: true } },
  originRegion: { select: { name: true } },
  destRegion: { select: { name: true } },
} satisfies Prisma.JobPostSelect;

export const LEASE_SEARCH_SELECT = {
  id: true,
  title: true,
  content: true,
  publishedAt: true,
  region: { select: { name: true } },
  vehicleType: { select: { name: true } },
  tonnage: { select: { name: true } },
} satisfies Prisma.LeasePostSelect;

export const BLOG_SEARCH_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  contentMarkdown: true,
  publishedAt: true,
  category: { select: { slug: true, name: true, isActive: true } },
} satisfies Prisma.BlogArticleSelect;

export const COMPANY_SEARCH_SELECT = {
  id: true,
  name: true,
  introduction: true,
  createdAt: true,
  region: { select: { name: true } },
} satisfies Prisma.CompanySelect;

export function buildJobSearchWhere(query: string, now: Date): Prisma.JobPostWhereInput {
  return {
    status: "OPEN",
    deletedAt: null,
    publishedAt: { lte: now, not: null },
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ],
  };
}
export function buildLeaseSearchWhere(query: string, now: Date): Prisma.LeasePostWhereInput {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    publishedAt: { lte: now, not: null },
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { content: { contains: query, mode: "insensitive" } },
    ],
  };
}

export function buildBlogSearchWhere(query: string, now: Date): Prisma.BlogArticleWhereInput {
  return {
    status: "PUBLISHED",
    publishedAt: { lte: now, not: null },
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { excerpt: { contains: query, mode: "insensitive" } },
      { contentMarkdown: { contains: query, mode: "insensitive" } },
    ],
  };
}

export function buildCompanySearchWhere(query: string): Prisma.CompanyWhereInput {
  return {
    status: "ACTIVE",
    deletedAt: null,
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { introduction: { contains: query, mode: "insensitive" } },
    ],
  };
}
