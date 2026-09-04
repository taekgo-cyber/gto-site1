import Link from "next/link";
import type { ReactNode } from "react";
import type { HomepageAdvertisementInventory } from "@/lib/monetization/homepage-ads";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { CompanyBanner } from "./CompanyBanner";
import { GeneralAdCard } from "./GeneralAdCard";
import { MainAdCard } from "./MainAdCard";
import { PremiumAdCard } from "./PremiumAdCard";
import { CommercialRail } from "./CommercialRail";

import { PagedAdvertisementSection } from "./PagedAdvertisementSection";
import { splitAdvertisementPages } from "@/lib/monetization/homepage-pages";
import { HOMEPAGE_AD_VISIBLE_SLOTS } from "@/lib/monetization/policy";

type Props = { inventory: HomepageAdvertisementInventory; trackingEnabled?: boolean };

export function HomepageCompanyRail({ inventory, trackingEnabled = true, side }: Props & { side?: "left" | "right" }) {
  const banners = side === "left" ? inventory.companyLeft : side === "right" ? inventory.companyRight : [...inventory.companyLeft, ...inventory.companyRight];
  const headingId = `company-sponsors-${side ?? "all"}-heading`;
  if (!banners.length) return null;
  return <aside className={`home-company-rail home-panel${side ? ` home-side-${side}` : ""}`} aria-labelledby={headingId}>
    <HomeSectionHeading id={headingId} title="기업 광고" />
    <p className="sr-only">추천 기업 광고</p>
    <CommercialRail label="추천 기업 광고 목록" className="home-company-grid snap-x snap-mandatory">
      {banners.map(advertisement => <CompanyBanner key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} />)}
    </CommercialRail>
    <Link href="/support" className="home-ad-inquiry">기업 광고 문의하기 ›</Link>
  </aside>;
}

export function HomepageMainSection({ inventory, trackingEnabled = true }: Props) {
  if (!inventory.main.length) return null;
  return <PagedAdvertisementSection id="main-advertisements" tier="MAIN"
    heading={<HomeSectionHeading id="main-advertisements" title="1. 주요 공고 (MAIN / VIP)" description="차량과 노선, 일자리 조건을 확인하세요." href="/jobs" />}
    pages={splitAdvertisementPages(inventory.main, HOMEPAGE_AD_VISIBLE_SLOTS.MAIN).map(page => <div key={page[0].id} className="home-main-cards">{page.map((advertisement, index) => <MainAdCard key={advertisement.id} advertisement={advertisement} eager={index === 0} trackingEnabled={trackingEnabled} />)}</div>)} />;
}

export function HomepageMonthlyBannerSection({ inventory, trackingEnabled = true }: Props) {
  const banners = [...inventory.companyLeft, ...inventory.companyRight];
  if (!banners.length) return null;
  return <section className="home-panel home-monthly-section" aria-labelledby="monthly-advertisements">
    <HomeSectionHeading id="monthly-advertisements" title="2. 기업 광고 (MONTHLY BANNER)" href="/companies" />
    <CommercialRail label="월간 기업 배너 목록" className="home-monthly-cards snap-x snap-mandatory">
      {banners.map(advertisement => <CompanyBanner key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} variant="horizontal" />)}
    </CommercialRail>
  </section>;
}

// At medium/mobile widths the monthly rail exposes the same twelve campaigns.
// Existing page-level tracking deduplicates real campaign impressions across mounts.
export function HomepagePrimeCommercialZone({ inventory, trackingEnabled = true, children }: Props & { children?: ReactNode }) {
  if (!children && !inventory.main.length && !inventory.companyLeft.length && !inventory.companyRight.length) return null;
  return <><div className="home-prime-content">{children}<HomepageMainSection inventory={inventory} trackingEnabled={trackingEnabled} /></div>
    <HomepageMonthlyBannerSection inventory={inventory} trackingEnabled={trackingEnabled} /></>;
}

export function HomepagePremiumSection({ inventory, trackingEnabled = true }: Props) {
  if (!inventory.premium.length) return null;
  return <PagedAdvertisementSection id="premium-advertisements" tier="PREMIUM"
    heading={<HomeSectionHeading id="premium-advertisements" title="3. 추천 공고 (PREMIUM)" description="엄선된 프리미엄 일자리를 추천합니다." href="/jobs" />}
    pages={splitAdvertisementPages(inventory.premium, HOMEPAGE_AD_VISIBLE_SLOTS.PREMIUM).map(page => <div key={page[0].id} className="home-premium-cards">{page.map(advertisement => <PremiumAdCard key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} />)}</div>)} />;
}

export function HomepageGeneralSponsoredSection({ inventory, trackingEnabled = true }: Props) {
  if (!inventory.general.length) return null;
  return <PagedAdvertisementSection id="general-advertisements" tier="GENERAL"
    heading={<HomeSectionHeading id="general-advertisements" title="4. 스폰서 공고 (GENERAL)" description="다양한 운송·지입 일자리를 만나보세요." href="/jobs" />}
    pages={splitAdvertisementPages(inventory.general, HOMEPAGE_AD_VISIBLE_SLOTS.GENERAL).map(page => <div key={page[0].id} className="home-general-grid">{page.map(advertisement => <GeneralAdCard key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} />)}</div>)} />;
}
