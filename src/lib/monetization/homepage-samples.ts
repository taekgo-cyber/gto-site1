import type { HomepageAdvertisementInventory, PublicHomepageAdvertisement } from "./homepage-ads";
import { HOMEPAGE_AD_INVENTORY_CAPACITY as capacity, HOMEPAGE_AD_PLACEMENTS, type PaidRecruitmentTier } from "./policy";

const regions = ["서울", "인천", "경기", "충청", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "부산", "대구", "강원", "제주"];
const vehicles = ["윙바디", "냉동탑차", "카고", "탑차", "냉장탑차", "트레일러"];
const tonnages = ["1톤", "2.5톤", "3.5톤", "5톤", "11톤", "11.5톤", "25톤"];
const work = ["고정 노선", "수도권 배송", "센터 간 운송", "새벽 배송", "주간 배송", "냉장 식품", "공산품", "자동차 부품", "택배", "편의점", "대형마트", "산업재"];
// Existing repository-generated editorial assets; no advertiser creatives or hotlinks.
const images = [
  "/images/blog/lease-tonnage-choice-beginners-featured.webp",
  "/images/blog/one-ton-cargo-job-beginner-guide-featured.webp",
  "/images/blog/cargo-vs-wingbody-work-guide-featured.webp",
];

export function createHomepageSample(index: number, tier: PaidRecruitmentTier | "left" | "right"): PublicHomepageAdvertisement {
  const company = tier === "left" || tier === "right";
  const offset = tier === "MAIN" ? 0 : tier === "PREMIUM" ? 20 : tier === "GENERAL" ? 50 : tier === "left" ? 90 : 96;
  const n = offset + index;
  const id = `sample-${tier.toLowerCase()}-${String(index + 1).padStart(2, "0")}`;
  const vehicle = vehicles[n % vehicles.length];
  const tonnage = vehicle === "트레일러" ? "25톤" : tonnages[n % tonnages.length];
  const basePay: Record<string, number> = { "1톤": 350, "2.5톤": 500, "3.5톤": 600, "5톤": 750, "11톤": 1000, "11.5톤": 1100, "25톤": 1300 };
  return {
    id, isSample: true, imagePosition: `${35 + n % 4 * 15}% ${40 + n % 3 * 20}%`,
    sampleListingType: n % 3 === 0 ? "지입" : "구인",
    advertisementType: company ? "COMPANY_BANNER" : "RECRUITMENT_LISTING",
    placementCode: tier === "left" ? HOMEPAGE_AD_PLACEMENTS.COMPANY_LEFT : tier === "right" ? HOMEPAGE_AD_PLACEMENTS.COMPANY_RIGHT : HOMEPAGE_AD_PLACEMENTS.RECRUITMENT,
    recruitmentTier: company ? null : tier as PaidRecruitmentTier,
    title: `${tonnage} ${vehicle} · ${work[n % work.length]}`,
    bannerCopy: `${regions[n % regions.length]} · ${work[n % work.length]}`,
    imageUrl: images[n % images.length],
    linkUrl: company ? "/companies" : n % 3 === 0 ? "/lease" : "/jobs",
    companyId: id, companyName: `${n % 2 ? "샘플물류" : "샘플운송"} ${String(n + 1).padStart(3, "0")}`,
    jobPostId: null, leasePostId: null,
    listing: company ? null : {
      payType: "MONTHLY", payAmount: basePay[tonnage] + n % 5 * 35,
      workType: n % 3 === 0 ? "CONTRACT" : "FULL_TIME",
      originRegionName: regions[n % regions.length], destRegionName: regions[(n + 3) % regions.length],
      regionName: null, vehicleTypeName: vehicle, tonnageName: tonnage, deadline: null,
    },
  };
}

export function createHomepageSampleInventory(): HomepageAdvertisementInventory {
  const group = (count: number, tier: Parameters<typeof createHomepageSample>[1]) => Array.from({ length: count }, (_, i) => createHomepageSample(i, tier));
  return { main: group(capacity.MAIN, "MAIN"), premium: group(capacity.PREMIUM, "PREMIUM"), general: group(capacity.GENERAL, "GENERAL"), companyLeft: group(capacity.COMPANY_LEFT, "left"), companyRight: group(capacity.COMPANY_RIGHT, "right") };
}

export function isHomepageSampleFillEnabled(environment: string | undefined, flag?: string): boolean {
  // Production publication needs a separate operational decision, even with the flag set.
  return environment === "development" && flag !== "false" && flag !== "0";
}

export function mergeHomepageSampleInventory(real: HomepageAdvertisementInventory): HomepageAdvertisementInventory {
  const samples = createHomepageSampleInventory();
  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  const result = { ...samples };
  for (const key of Object.keys(samples) as (keyof HomepageAdvertisementInventory)[]) {
    const limit = samples[key].length;
    const selected: PublicHomepageAdvertisement[] = [];
    for (const ad of real[key]) {
      if (selected.length === limit) break;
      const target = ad.jobPostId ? `job:${ad.jobPostId}` : ad.leasePostId ? `lease:${ad.leasePostId}` : null;
      if (ad.isSample || seenIds.has(ad.id) || (target && seenTargets.has(target))) continue;
      seenIds.add(ad.id);
      if (target) seenTargets.add(target);
      selected.push(ad);
    }
    result[key] = [...selected, ...samples[key].filter(ad => !seenIds.has(ad.id)).slice(0, limit - selected.length)];
  }
  return result;
}

export function homepageAdTracking(ad: PublicHomepageAdvertisement, enabled = true) {
  const track = enabled && !ad.isSample;
  return { enabled: track, href: track ? `/api/ads/${encodeURIComponent(ad.id)}/click` : ad.linkUrl };
}
