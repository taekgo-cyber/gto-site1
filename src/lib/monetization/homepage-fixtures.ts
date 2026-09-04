import type {
  HomepageAdvertisementInventory,
} from "./homepage-ads";
import { HOMEPAGE_AD_INVENTORY_CAPACITY } from "./policy";
import { createHomepageSample } from "./homepage-samples";

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

export function getHomepageAdvertisementFixture(preset: HomepageAdFixturePreset): HomepageAdvertisementInventory {
  const empty: HomepageAdvertisementInventory = { main: [], premium: [], general: [], companyLeft: [], companyRight: [] };
  const mainCount = preset === "one-main" ? 1
    : preset === "main-2" ? 2
      : preset === "main-3-pool" ? 3
        : preset === "main-full" || preset === "full" ? 20
          : preset === "long-korean-title" || preset === "no-images" ? 2
            : 0;
  const premiumCount = preset === "premium-only" ? 1
    : preset === "premium-full" || preset === "full" ? 30
      : preset === "no-images" ? 6
        : 0;
  const generalCount = preset === "full" ? 40 : 0;
  const sideCount = preset === "one-side" ? 1 : preset === "side-only" || preset === "full" || preset === "no-images" ? 2 : 0;
  if (preset === "empty") return empty;
  const longTitle = "서울 경기 인천 전 지역 새벽배송과 주간 고정노선을 함께 운행할 성실한 5톤 윙바디 화물 운송기사님을 모집합니다";
  const mainCandidates = Array.from({ length: mainCount }, (_, index) => ({ ...createHomepageSample(index, "MAIN"),
    ...(preset === "long-korean-title" ? { title: longTitle, companyName: "운전픽 샘플기업 수도권통합운영본부 예시" } : {}),
    ...(preset === "no-images" ? { imageUrl: null } : {}),
  }));
  const premiumCandidates = Array.from({ length: premiumCount }, (_, index) => ({ ...createHomepageSample(index, "PREMIUM"), ...(preset === "no-images" ? { imageUrl: null } : {}) }));
  const generalCandidates = Array.from({ length: generalCount }, (_, index) => createHomepageSample(index, "GENERAL"));
  return {
    main: mainCandidates,
    premium: premiumCandidates,
    general: generalCandidates,
    companyLeft: sideCount >= 1 ? Array.from({ length: preset === "full" ? HOMEPAGE_AD_INVENTORY_CAPACITY.COMPANY_LEFT : 1 }, (_, i) => createHomepageSample(i, "left")) : [],
    companyRight: sideCount >= 2 ? Array.from({ length: preset === "full" ? HOMEPAGE_AD_INVENTORY_CAPACITY.COMPANY_RIGHT : 1 }, (_, i) => createHomepageSample(i, "right")) : [],
  };
}
