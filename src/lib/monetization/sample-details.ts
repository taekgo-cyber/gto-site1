import type { JobPostDetail } from "@/lib/jobs/dal";
import type { PostPublic } from "@/lib/posts/service";
import type { getPublicCompany } from "@/lib/company/public";
import type { PublicHomepageAdvertisement } from "./homepage-ads";
import { createHomepageSampleInventory, isHomepageSampleFillEnabled } from "./homepage-samples";

export type SampleDomain = "jobs" | "lease" | "companies";
export type PublicCompanyDetail = NonNullable<Awaited<ReturnType<typeof getPublicCompany>>>;

// The reserved sample namespace cannot overlap the DB's generated CUID IDs.
// Resolve only exact inventory IDs, in their matching domain, before any DAL call.
export function getHomepageSampleDetail(id: string, domain: SampleDomain): PublicHomepageAdvertisement | null {
  if (!id.startsWith("sample-") || !isHomepageSampleFillEnabled(process.env.NODE_ENV, process.env.ENABLE_HOMEPAGE_SAMPLE_INVENTORY)) return null;
  return Object.values(createHomepageSampleInventory()).flat().find(ad => ad.id === id && ad.linkUrl === `/${domain}/${id}`) ?? null;
}

const sampleDate = new Date("2026-09-01T00:00:00.000Z");
function description(ad: PublicHomepageAdvertisement) {
  return `${ad.companyName}의 ${ad.title} 예시입니다.\n${ad.bannerCopy ?? "운송 업무 조건을 확인하세요."}\n차량, 노선과 수익 조건은 영업용 화면 검증을 위한 허구의 정보입니다. 실제 모집이나 계약이 아니며 문의는 접수되지 않습니다.`;
}

export function sampleJobPost(ad: PublicHomepageAdvertisement): JobPostDetail {
  const listing = ad.listing!;
  return {
    id: ad.id, type: "JOB", title: ad.title, description: description(ad),
    originAddress: null, destAddress: null, ...listing,
    workDescription: ad.title.split(" · ")[1], publishedAt: sampleDate, viewCount: 0,
    status: "OPEN", companyName: ad.companyName, companyPhone: null, authorName: ad.companyName,
  };
}

export function sampleLeasePost(ad: PublicHomepageAdvertisement): PostPublic {
  const listing = ad.listing!;
  return {
    id: ad.id, type: "HIRE", title: ad.title, content: description(ad), status: "PUBLISHED", viewCount: 0,
    ...listing, regionName: `${listing.originRegionName} → ${listing.destRegionName}`,
    conditions: { text: ad.title.split(" · ")[1] }, publishedAt: sampleDate, createdAt: sampleDate, updatedAt: sampleDate,
    author: { id: ad.companyId, name: ad.companyName, nickname: null }, attachments: [],
  };
}

export function sampleCompany(ad: PublicHomepageAdvertisement): PublicCompanyDetail {
  return {
    id: ad.companyId, name: ad.companyName, introduction: description(ad), createdAt: sampleDate, updatedAt: sampleDate,
    region: { name: ad.bannerCopy?.split(" · ")[0] ?? "전국" }, jobPosts: [], leasePosts: [],
  };
}

/** Opt-in local QA only: public real details can be inspected without view-counter writes. */
export function isReadOnlyDetailPreview(): boolean {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_READ_ONLY_DETAIL_PREVIEW === "true";
}
