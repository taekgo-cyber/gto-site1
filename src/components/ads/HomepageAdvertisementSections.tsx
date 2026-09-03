import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import type { HomepageAdvertisementInventory } from "@/lib/monetization/homepage-ads";
import { CompanyBanner } from "./CompanyBanner";
import { GeneralAdCard } from "./GeneralAdCard";
import { MainAdCard } from "./MainAdCard";
import { PremiumAdCard } from "./PremiumAdCard";
import { CommercialRail } from "./CommercialRail";

function SponsorRail({
  inventory,
  trackingEnabled,
}: {
  inventory: HomepageAdvertisementInventory;
  trackingEnabled: boolean;
}) {
  const banners = [...inventory.companyLeft, ...inventory.companyRight];
  if (banners.length === 0) return null;
  return (
    <div aria-labelledby="company-sponsors-heading" className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Trusted Partners</p>
          <h3 id="company-sponsors-heading" className="mt-1 text-xl font-bold">추천 기업 <span className="text-xs font-semibold text-muted-foreground">· 월간 광고</span></h3>
        </div>
      </div>
      <CommercialRail
        label="추천 기업 광고 목록"
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 xl:flex-col xl:overflow-visible xl:pb-0"
      >
        {banners.map((advertisement) => (
          <CompanyBanner
            key={advertisement.id}
            advertisement={advertisement}
            trackingEnabled={trackingEnabled}
          />
        ))}
      </CommercialRail>
    </div>
  );
}

export function HomepagePrimeCommercialZone({
  inventory,
  trackingEnabled = true,
}: {
  inventory: HomepageAdvertisementInventory;
  trackingEnabled?: boolean;
}) {
  const hasMain = inventory.main.length > 0;
  const hasBanners = inventory.companyLeft.length > 0 || inventory.companyRight.length > 0;
  if (!hasMain && !hasBanners) return null;

  return (
    <section aria-labelledby="main-advertisements" className="border-b border-border bg-surface py-9 sm:py-11">
      <Container>
        <SectionHeading
          eyebrow="MAIN / VIP"
          title={hasMain ? "운전픽 주요 공고" : "추천 운송 기업"}
          description={hasMain
            ? "노선, 차량 조건과 수익 정보를 한눈에 비교할 수 있는 최상단 광고 공고입니다."
            : "운전픽이 소개하는 월간 기업 광고입니다."}
          action={hasMain ? <span className="inline-flex rounded-full border border-primary/20 bg-blue-50 px-3 py-1.5 text-xs font-bold text-primary">한정 노출</span> : undefined}
        />
        <div className={`mt-6 grid min-w-0 gap-7 ${hasMain && hasBanners ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
          {hasMain ? (
            <div className="min-w-0">
              <CommercialRail
                label="MAIN 광고 목록"
                className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0"
              >
              {inventory.main.map((advertisement, index) => (
                <MainAdCard
                  key={advertisement.id}
                  advertisement={advertisement}
                  eager={index === 0}
                  trackingEnabled={trackingEnabled}
                />
              ))}
              </CommercialRail>
            </div>
          ) : null}
          {hasBanners ? <SponsorRail inventory={inventory} trackingEnabled={trackingEnabled} /> : null}
        </div>
      </Container>
    </section>
  );
}

export function HomepagePremiumSection({
  inventory,
  trackingEnabled = true,
}: {
  inventory: HomepageAdvertisementInventory;
  trackingEnabled?: boolean;
}) {
  if (inventory.premium.length === 0) return null;
  return (
    <section aria-labelledby="premium-advertisements" className="border-b border-border bg-background py-10 sm:py-12">
      <Container>
        <SectionHeading eyebrow="PREMIUM" title="프리미엄 추천 공고" description="검토된 유료 공고의 핵심 조건을 빠르게 비교하세요." />
        <CommercialRail
          label="PREMIUM 광고 목록"
          className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:gap-5"
        >
          {inventory.premium.map((advertisement) => (
            <PremiumAdCard
              key={advertisement.id}
              advertisement={advertisement}
              trackingEnabled={trackingEnabled}
            />
          ))}
        </CommercialRail>
      </Container>
    </section>
  );
}

export function HomepageGeneralSponsoredSection({
  inventory,
  trackingEnabled = true,
}: {
  inventory: HomepageAdvertisementInventory;
  trackingEnabled?: boolean;
}) {
  if (inventory.general.length === 0) return null;
  return (
    <section aria-labelledby="general-advertisements" className="border-b border-border bg-surface py-9 sm:py-10">
      <Container>
        <SectionHeading eyebrow="GENERAL" title="스폰서 공고" description="지역과 차량, 급여 조건을 중심으로 정리한 광고 공고입니다." />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inventory.general.map((advertisement) => (
            <GeneralAdCard
              key={advertisement.id}
              advertisement={advertisement}
              trackingEnabled={trackingEnabled}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
