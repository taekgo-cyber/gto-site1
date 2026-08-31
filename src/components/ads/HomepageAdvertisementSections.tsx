import { Container } from "@/components/common/Container";
import type { HomepageAdvertisementInventory } from "@/lib/monetization/homepage-ads";
import { CompanyBanner } from "./CompanyBanner";
import { GeneralAdCard } from "./GeneralAdCard";
import { MainAdCard } from "./MainAdCard";
import { PremiumAdCard } from "./PremiumAdCard";

function SponsorRail({ inventory, trackingEnabled }: { inventory: HomepageAdvertisementInventory; trackingEnabled: boolean }) {
  const banners = [...inventory.companyLeft, ...inventory.companyRight];
  if (banners.length === 0) return null;
  return (
    <section aria-labelledby="company-sponsors-mobile" className="border-b border-border bg-surface py-7 xl:hidden">
      <Container>
        <h2 id="company-sponsors-mobile" className="text-lg font-bold">추천 기업 <span className="text-xs font-medium text-muted-foreground">· 광고</span></h2>
        <div aria-label="추천 기업 광고 목록" className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {banners.map((advertisement) => <CompanyBanner key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} />)}
        </div>
      </Container>
    </section>
  );
}

export function HomepagePrimeCommercialZone({ inventory, trackingEnabled = true }: { inventory: HomepageAdvertisementInventory; trackingEnabled?: boolean }) {
  const left = inventory.companyLeft[0] ?? null;
  const right = inventory.companyRight[0] ?? null;
  const hasMain = inventory.main.length > 0;
  const hasBanners = Boolean(left || right);
  if (!hasMain && !hasBanners) return null;
  if (!hasMain) return <SponsorRail inventory={inventory} trackingEnabled={trackingEnabled} />;

  const desktopColumns = left && right
    ? "xl:grid-cols-[11rem_minmax(0,1fr)_11rem] 2xl:grid-cols-[12.5rem_minmax(0,1fr)_12.5rem]"
    : left
      ? "xl:grid-cols-[11rem_minmax(0,1fr)] 2xl:grid-cols-[12.5rem_minmax(0,1fr)]"
      : right
        ? "xl:grid-cols-[minmax(0,1fr)_11rem] 2xl:grid-cols-[minmax(0,1fr)_12.5rem]"
        : "xl:grid-cols-1";
  return (
    <>
      <section aria-labelledby="main-advertisements" className="border-b border-border bg-surface py-9 sm:py-12">
        <div className="mx-auto w-full max-w-[1536px] px-4 sm:px-6 xl:px-8">
          <div className="mb-5">
            <p className="text-xs font-semibold tracking-wide text-primary">PRIME LISTINGS</p>
            <h2 id="main-advertisements" className="mt-1 text-2xl font-bold">주요 운송·지입 공고</h2>
            <p className="mt-1 text-sm text-muted-foreground">검토된 유료 공고를 조건 중심으로 비교하세요.</p>
          </div>
          <div className={`grid gap-4 ${desktopColumns}`}>
            {left ? <div className="hidden xl:block"><CompanyBanner advertisement={left} trackingEnabled={trackingEnabled} /></div> : null}
            <div className="min-w-0">
              <div aria-label="MAIN 광고 목록" className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0">
                {inventory.main.map((advertisement, index) => (
                  <MainAdCard key={advertisement.id} advertisement={advertisement} eager={index === 0} trackingEnabled={trackingEnabled} />
                ))}
              </div>
            </div>
            {right ? <div className="hidden xl:block"><CompanyBanner advertisement={right} trackingEnabled={trackingEnabled} /></div> : null}
          </div>
        </div>
      </section>
      <SponsorRail inventory={inventory} trackingEnabled={trackingEnabled} />
    </>
  );
}

export function HomepagePremiumSection({ inventory, trackingEnabled = true }: { inventory: HomepageAdvertisementInventory; trackingEnabled?: boolean }) {
  if (inventory.premium.length === 0) return null;
  return (
    <section aria-labelledby="premium-advertisements" className="border-b border-border bg-background py-10 sm:py-12">
      <Container>
        <h2 id="premium-advertisements" className="text-2xl font-bold">프리미엄 공고</h2>
        <p className="mt-1 text-sm text-muted-foreground">핵심 조건을 빠르게 확인할 수 있는 광고 공고입니다.</p>
        <div aria-label="PREMIUM 광고 목록" className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {inventory.premium.map((advertisement) => <PremiumAdCard key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} />)}
        </div>
      </Container>
    </section>
  );
}

export function HomepageGeneralSponsoredSection({ inventory, trackingEnabled = true }: { inventory: HomepageAdvertisementInventory; trackingEnabled?: boolean }) {
  if (inventory.general.length === 0) return null;
  return (
    <section aria-labelledby="general-advertisements" className="border-b border-border bg-surface py-10 sm:py-12">
      <Container>
        <h2 id="general-advertisements" className="text-xl font-bold">스폰서 공고</h2>
        <p className="mt-1 text-sm text-muted-foreground">광고 상품으로 노출되는 운송·지입 공고입니다.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inventory.general.map((advertisement) => <GeneralAdCard key={advertisement.id} advertisement={advertisement} trackingEnabled={trackingEnabled} />)}
        </div>
      </Container>
    </section>
  );
}
