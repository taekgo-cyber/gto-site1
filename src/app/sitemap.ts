import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSeoLandingMasterData } from "@/lib/seo/landing";
import { getCbtCategories } from "@/lib/cbt/dal";
import { listPublishedBlogSitemapRows } from "@/lib/blog/dal";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

// Keep one sitemap safely below the 50,000 URL protocol limit. When any source
// approaches its cap, production should move to generateSitemaps-based shards.
const SITEMAP_LEASE_LIMIT = 10_000;
const SITEMAP_JOB_LIMIT = 15_000;
const SITEMAP_COMPANY_LIMIT = 5_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const { regions, tonnages } = await getSeoLandingMasterData();

  const regionIdToSlug = new Map<string, string>();
  for (const [slug, region] of regions) regionIdToSlug.set(region.id, slug);

  const tonnageIdToSlug = new Map<string, string>();
  for (const [slug, tonnage] of tonnages) tonnageIdToSlug.set(tonnage.id, slug);

  const [leasePosts, jobPosts, cbtCategories, blogRows, companies] = await Promise.all([
    prisma.leasePost.findMany({
      where: { status: "PUBLISHED", deletedAt: null, publishedAt: { not: null } },
      select: { id: true, publishedAt: true, regionId: true, tonnageId: true },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: SITEMAP_LEASE_LIMIT,
    }),
    prisma.jobPost.findMany({
      where: { status: "OPEN", deletedAt: null, publishedAt: { not: null } },
      select: { id: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: SITEMAP_JOB_LIMIT,
    }),
    getCbtCategories(),
    listPublishedBlogSitemapRows(),
    // Some isolated legacy sitemap tests provide only the post delegates.
    // The production Prisma client always has Company; retain a safe empty
    // fallback for those narrow dependency mocks.
    (prisma as typeof prisma & { company?: typeof prisma.company }).company?.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: SITEMAP_COMPANY_LIMIT,
    }) ?? Promise.resolve([]),
  ]);

  const regionLanding = new Map<string, string | undefined>();
  const tonnageLanding = new Map<string, string | undefined>();

  const entries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/jobs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/lease`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/cbt`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/companies`, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/support`, changeFrequency: "monthly", priority: 0.4 },
  ];

  for (const category of cbtCategories) {
    entries.push({
      url: `${baseUrl}/cbt/${category.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const post of leasePosts) {
    const regionSlug = post.regionId
      ? regionIdToSlug.get(post.regionId)
      : undefined;
    if (regionSlug) {
      regionLanding.set(
        `${baseUrl}/lease/region/${regionSlug}`,
        post.publishedAt?.toISOString(),
      );
    }
    if (regionSlug && post.tonnageId) {
      const tonnageSlug = tonnageIdToSlug.get(post.tonnageId);
      if (tonnageSlug) {
        tonnageLanding.set(
          `${baseUrl}/lease/region/${regionSlug}/${tonnageSlug}`,
          post.publishedAt?.toISOString(),
        );
      }
    }
    entries.push({
      url: `${baseUrl}/lease/${post.id}`,
      lastModified: post.publishedAt ?? undefined,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  for (const [url, lastModified] of regionLanding) {
    entries.push({
      url,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }
  for (const [url, lastModified] of tonnageLanding) {
    entries.push({
      url,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }
  for (const post of jobPosts) {
    entries.push({
      url: `${baseUrl}/jobs/${post.id}`,
      lastModified: post.publishedAt ?? undefined,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  for (const category of blogRows.categories) {
    entries.push({
      url: `${baseUrl}/blog/category/${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const article of blogRows.articles) {
    entries.push({
      url: `${baseUrl}/blog/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const company of companies) {
    entries.push({
      url: `${baseUrl}/companies/${company.id}`,
      lastModified: company.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
