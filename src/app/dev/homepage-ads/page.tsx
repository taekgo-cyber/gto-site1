import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import {
  HomepageGeneralSponsoredSection,
  HomepagePremiumSection,
  HomepagePrimeCommercialZone,
} from "@/components/ads/HomepageAdvertisementSections";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";
import {
  getHomepageAdvertisementFixture,
  HOMEPAGE_AD_FIXTURE_PRESETS,
  isHomepageAdvertisementFixtureEnabled,
  type HomepageAdFixturePreset,
} from "@/lib/monetization/homepage-fixtures";

export const dynamic = "force-dynamic";

export default async function HomepageAdsFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  if (!isHomepageAdvertisementFixtureEnabled(process.env.NODE_ENV)) notFound();
  const { preset: rawPreset } = await searchParams;
  const preset = HOMEPAGE_AD_FIXTURE_PRESETS.includes(rawPreset as HomepageAdFixturePreset)
    ? rawPreset as HomepageAdFixturePreset
    : "full";
  const inventory = getHomepageAdvertisementFixture(preset);
  return (
    <main className="min-h-screen bg-surface">
      <section className="border-b border-border bg-background">
        <Container className="py-8">
          <p className="text-xs font-semibold text-primary">DEV VISUAL FIXTURE</p>
          <h1 className="mt-1 text-3xl font-bold">홈 광고 시각 검증</h1>
          <p className="mt-2 text-sm text-muted-foreground">현재 preset: {preset}</p>
          <Link
            href={`/?adFixture=${preset}`}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-sm hover:bg-[#0f56c0]"
          >
            전체 홈페이지에서 보기 →
          </Link>
          <nav aria-label="광고 fixture preset" className="mt-4 flex flex-wrap gap-2">
            {HOMEPAGE_AD_FIXTURE_PRESETS.map((item) => (
              <Link key={item} href={`/dev/homepage-ads?preset=${item}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm hover:border-primary/40">{item}</Link>
            ))}
          </nav>
          <div className="mt-7 max-w-3xl">
            <h2 className="text-2xl font-bold">운송 조건을 빠르게 찾아보세요</h2>
            <div className="mt-4"><UnifiedSearchForm formId="fixture-search" inputId="fixture-search-input" ariaLabel="fixture 통합검색" variant="hero" /></div>
          </div>
        </Container>
      </section>
      <HomepagePrimeCommercialZone inventory={inventory} trackingEnabled={false} />
      <HomepagePremiumSection inventory={inventory} trackingEnabled={false} />
      <HomepageGeneralSponsoredSection inventory={inventory} trackingEnabled={false} />
    </main>
  );
}
