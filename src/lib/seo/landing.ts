import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  buildRegionSlugMap,
  buildTonnageSlugMap,
  type SlugRegionRecord,
  type SlugTonnageRecord,
} from "@/lib/seo/slugs";

export type SeoLandingRegion = {
  id: string;
  name: string;
  slug: string;
};

export type SeoLandingTonnage = {
  id: string;
  name: string;
  slug: string;
};

export type SeoLandingData = {
  region: SeoLandingRegion;
  tonnage: SeoLandingTonnage | null;
  postCount: number;
};

export type SeoLandingMasterData = {
  regions: Map<string, SlugRegionRecord>;
  tonnages: Map<string, SlugTonnageRecord>;
};

export const getSeoLandingMasterData = cache(
  async (): Promise<SeoLandingMasterData> => {
    const [regions, tonnages] = await Promise.all([
      prisma.region.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      }),
      prisma.tonnage.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, weightKg: true },
      }),
    ]);

    return {
      regions: buildRegionSlugMap(regions),
      tonnages: buildTonnageSlugMap(tonnages),
    };
  },
);

/**
 * SEO 랜딩 데이터를 조회한다.
 * 유효하지 않은 slug이거나 해당 조건의 공개 매물이 0건이면 null을 반환한다.
 */
export const getLandingData = cache(
  async (
    regionSlug: string,
    tonnageSlug?: string,
  ): Promise<SeoLandingData | null> => {
    const { regions, tonnages } = await getSeoLandingMasterData();

    const region = regions.get(regionSlug);
    if (!region) return null;

    const tonnage = tonnageSlug !== undefined ? tonnages.get(tonnageSlug) : null;
    if (tonnageSlug !== undefined && !tonnage) return null;

    const where: Prisma.LeasePostWhereInput = {
      status: "PUBLISHED",
      deletedAt: null,
      publishedAt: { not: null },
      regionId: region.id,
      ...(tonnage ? { tonnageId: tonnage.id } : {}),
    };

    const postCount = await prisma.leasePost.count({ where });
    if (postCount === 0) return null;

    return {
      region: { id: region.id, name: region.name, slug: regionSlug },
      tonnage:
        tonnage && tonnageSlug !== undefined
          ? { id: tonnage.id, name: tonnage.name, slug: tonnageSlug }
          : null,
      postCount,
    };
  },
);
