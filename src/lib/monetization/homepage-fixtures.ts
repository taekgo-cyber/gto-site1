import type {
  HomepageAdvertisementInventory,
  PublicHomepageAdvertisement,
} from "./homepage-ads";
import { HOMEPAGE_AD_VISIBLE_SLOTS, HOMEPAGE_AD_PLACEMENTS, type PaidRecruitmentTier } from "./policy";
import { rotateAdvertisementCandidates } from "./rotation";

export const HOMEPAGE_AD_FIXTURE_PRESETS = [
  "empty",
  "one-main",
  "main-2",
  "main-3-pool",
  "main-full",
  "premium-only",
  "premium-full",
  "one-side",
  "side-only",
  "full",
  "long-korean-title",
  "no-images",
] as const;

export type HomepageAdFixturePreset = (typeof HOMEPAGE_AD_FIXTURE_PRESETS)[number];

export function isHomepageAdvertisementFixtureEnabled(environment: string | undefined): boolean {
  return environment !== "production";
}

export function resolveHomepageAdvertisementFixture(
  preset: string | undefined,
  environment: string | undefined,
): HomepageAdvertisementInventory | null {
  if (
    !preset ||
    !isHomepageAdvertisementFixtureEnabled(environment) ||
    !HOMEPAGE_AD_FIXTURE_PRESETS.includes(preset as HomepageAdFixturePreset)
  ) {
    return null;
  }
  return getHomepageAdvertisementFixture(preset as HomepageAdFixturePreset);
}

function listingAd(index: number, tier: PaidRecruitmentTier, overrides: Partial<PublicHomepageAdvertisement> = {}): PublicHomepageAdvertisement {
  return {
    id: `${tier.toLowerCase()}-${index}`,
    advertisementType: "RECRUITMENT_LISTING",
    placementCode: HOMEPAGE_AD_PLACEMENTS.RECRUITMENT,
    recruitmentTier: tier,
    title: `수도권 ${index + 1}번 5톤 냉장 화물 운송기사 모집`,
    bannerCopy: null,
    imageUrl: index % 2 === 0 ? "/images/blog/one-ton-cargo-job-beginner-guide-featured.webp" : null,
    linkUrl: `/jobs/fixture-${index}`,
    companyId: `company-${index}`,
    companyName: `안심운송 ${index + 1}지점`,
    jobPostId: `job-${tier}-${index}`,
    leasePostId: null,
    listing: {
      payType: "MONTHLY",
      payAmount: 450 + index * 10,
      workType: "FULL_TIME",
      originRegionName: "경기 화성",
      destRegionName: "서울 강서",
      regionName: null,
      vehicleTypeName: "윙바디",
      tonnageName: "5톤",
      deadline: new Date("2026-09-30T00:00:00.000Z"),
    },
    ...overrides,
  };
}

function banner(index: number, side: "left" | "right"): PublicHomepageAdvertisement {
  return {
    id: `banner-${side}-${index}`,
    advertisementType: "COMPANY_BANNER",
    placementCode: side === "left" ? HOMEPAGE_AD_PLACEMENTS.COMPANY_LEFT : HOMEPAGE_AD_PLACEMENTS.COMPANY_RIGHT,
    recruitmentTier: null,
    title: "안전 운행과 정산을 우선하는 운송 파트너",
    bannerCopy: "투명한 배차와 정산 기준을 확인하세요.",
    imageUrl: index % 2 === 0 ? "/images/blog/gyeonggi-incheon-cargo-jobs-guide-featured.webp" : null,
    linkUrl: `/companies/fixture-${side}-${index}`,
    companyId: `banner-company-${side}-${index}`,
    companyName: `${side === "left" ? "대한" : "한결"}물류`,
    jobPostId: null,
    leasePostId: null,
    listing: null,
  };
}

function selected(candidates: PublicHomepageAdvertisement[], slots: number, groupKey: string) {
  return rotateAdvertisementCandidates({ candidates, visibleSlots: slots, windowKey: 0, groupKey });
}

export function getHomepageAdvertisementFixture(preset: HomepageAdFixturePreset): HomepageAdvertisementInventory {
  const empty: HomepageAdvertisementInventory = { main: [], premium: [], general: [], companyLeft: [], companyRight: [] };
  const mainCount = preset === "one-main" ? 1
    : preset === "main-2" ? 2
      : preset === "main-3-pool" ? 3
        : preset === "main-full" || preset === "full" ? 8
          : preset === "long-korean-title" || preset === "no-images" ? 2
            : 0;
  const premiumCount = preset === "premium-only" ? 1
    : preset === "premium-full" || preset === "full" ? 20
      : preset === "no-images" ? 6
        : 0;
  const generalCount = preset === "full" ? 8 : 0;
  const sideCount = preset === "one-side" ? 1 : preset === "side-only" || preset === "full" || preset === "no-images" ? 2 : 0;
  if (preset === "empty") return empty;
  const longTitle = "서울 경기 인천 전 지역 새벽배송과 주간 고정노선을 함께 운행할 성실한 5톤 윙바디 화물 운송기사님을 모집합니다";
  const mainCandidates = Array.from({ length: mainCount }, (_, index) => listingAd(index, "MAIN", {
    ...(preset === "long-korean-title" ? { title: longTitle, companyName: "대한민국신뢰상생종합화물운송주식회사 수도권통합운영본부" } : {}),
    ...(preset === "no-images" ? { imageUrl: null } : {}),
  }));
  const premiumCandidates = Array.from({ length: premiumCount }, (_, index) => listingAd(index + 20, "PREMIUM", preset === "no-images" ? { imageUrl: null } : {}));
  const generalCandidates = Array.from({ length: generalCount }, (_, index) => listingAd(index + 50, "GENERAL", { imageUrl: null }));
  return {
    main: selected(mainCandidates, HOMEPAGE_AD_VISIBLE_SLOTS.MAIN, "fixture-main"),
    premium: selected(premiumCandidates, HOMEPAGE_AD_VISIBLE_SLOTS.PREMIUM, "fixture-premium"),
    general: selected(generalCandidates, HOMEPAGE_AD_VISIBLE_SLOTS.GENERAL, "fixture-general"),
    companyLeft: sideCount >= 1 ? [banner(0, "left")] : [],
    companyRight: sideCount >= 2 ? [banner(0, "right")] : [],
  };
}
