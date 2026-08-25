import { prisma } from "@/lib/prisma";
import {
  SEARCH_SOURCE_CANDIDATE_LIMIT,
  type SearchCandidate,
  type SearchDomain,
  type UnifiedSearchPage,
  type UnifiedSearchRequest,
} from "./contract";
import {
  BLOG_SEARCH_SELECT,
  JOB_SEARCH_SELECT,
  LEASE_SEARCH_SELECT,
  buildBlogSearchWhere,
  buildJobSearchWhere,
  buildLeaseSearchWhere,
} from "./source-contract";
import {
  createUnifiedSearchPage,
  type SearchCandidateBatch,
} from "./service";

const SOURCE_TAKE = SEARCH_SOURCE_CANDIDATE_LIMIT + 1;

function joinContext(values: Array<string | null | undefined>): string | null {
  const context = values.filter((value): value is string => Boolean(value)).join(" · ");
  return context || null;
}

async function getJobCandidates(query: string, now: Date): Promise<SearchCandidateBatch> {
  const rows = await prisma.jobPost.findMany({
    where: buildJobSearchWhere(query, now),
    select: JOB_SEARCH_SELECT,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: SOURCE_TAKE,
  });

  return {
    domain: "JOBS",
    candidates: rows.flatMap((row): SearchCandidate[] =>
      row.publishedAt
        ? [{
            id: row.id,
            domain: "JOBS",
            title: row.title,
            body: row.description,
            href: `/jobs/${row.id}`,
            context: joinContext([
              row.company?.name,
              row.originRegion?.name && row.destRegion?.name
                ? `${row.originRegion.name} → ${row.destRegion.name}`
                : row.originRegion?.name ?? row.destRegion?.name,
            ]),
            publishedAt: row.publishedAt,
          }]
        : [],
    ),
  };
}

async function getLeaseCandidates(query: string, now: Date): Promise<SearchCandidateBatch> {
  const rows = await prisma.leasePost.findMany({
    where: buildLeaseSearchWhere(query, now),
    select: LEASE_SEARCH_SELECT,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: SOURCE_TAKE,
  });

  return {
    domain: "LEASE",
    candidates: rows.flatMap((row): SearchCandidate[] =>
      row.publishedAt
        ? [{
            id: row.id,
            domain: "LEASE",
            title: row.title,
            body: row.content,
            href: `/lease/${row.id}`,
            context: joinContext([
              row.region?.name,
              row.vehicleType?.name,
              row.tonnage?.name,
            ]),
            publishedAt: row.publishedAt,
          }]
        : [],
    ),
  };
}

async function getBlogCandidates(query: string, now: Date): Promise<SearchCandidateBatch> {
  const rows = await prisma.blogArticle.findMany({
    where: buildBlogSearchWhere(query, now),
    select: BLOG_SEARCH_SELECT,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: SOURCE_TAKE,
  });

  return {
    domain: "BLOG",
    candidates: rows.flatMap((row): SearchCandidate[] =>
      row.publishedAt
        ? [{
            id: row.id,
            domain: "BLOG",
            title: row.title,
            body: joinContext([row.excerpt, row.contentMarkdown]),
            href: `/blog/${row.slug}`,
            context: row.category?.isActive ? row.category.name : null,
            publishedAt: row.publishedAt,
          }]
        : [],
    ),
  };
}

const sourceLoaders: Record<
  SearchDomain,
  (query: string, now: Date) => Promise<SearchCandidateBatch>
> = {
  JOBS: getJobCandidates,
  LEASE: getLeaseCandidates,
  BLOG: getBlogCandidates,
};

export async function searchPublicContent(
  request: UnifiedSearchRequest,
  now = new Date(),
): Promise<UnifiedSearchPage> {
  const batches = await Promise.all(
    request.domains.map((domain) => sourceLoaders[domain](request.query, now)),
  );
  return createUnifiedSearchPage(request, batches);
}
