import { isHomepageSampleFillEnabled, mergeHomepageSampleInventory } from "@/lib/monetization/homepage-samples";
import {
  HomepageCompanyRail,
  HomepageGeneralSponsoredSection,
  HomepagePremiumSection,
  HomepagePrimeCommercialZone,
} from "@/components/ads/HomepageAdvertisementSections";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeBlogSection, HomeLatestInformation, HomeServiceRail } from "@/components/home/HomeContent";
import { getJobPostList } from "@/lib/jobs/dal";
import { getPostList } from "@/lib/posts/dal";
import { listPublishedBlogArticles } from "@/lib/blog/dal";
import { listHomepageAdvertisementInventory } from "@/lib/monetization/homepage-ads";
import { resolveHomepageAdvertisementFixture } from "@/lib/monetization/homepage-fixtures";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ adFixture?: string }> }) {
  const { adFixture } = await searchParams;
  const fixture = resolveHomepageAdvertisementFixture(adFixture, process.env.NODE_ENV);
  const realAds = fixture ?? await listHomepageAdvertisementInventory();
  const homeAds = !fixture && isHomepageSampleFillEnabled(process.env.NODE_ENV, process.env.ENABLE_HOMEPAGE_SAMPLE_INVENTORY) ? mergeHomepageSampleInventory(realAds) : realAds;
  const paidAds = [...homeAds.main, ...homeAds.premium, ...homeAds.general];
  const paidJobIds = paidAds.flatMap(advertisement => advertisement.jobPostId ? [advertisement.jobPostId] : []);
  const paidLeaseIds = paidAds.flatMap(advertisement => advertisement.leasePostId ? [advertisement.leasePostId] : []);
  const [jobResult, leaseResult, blogResult] = await Promise.all([
    getJobPostList({ page: 1, excludeIds: paidJobIds }),
    getPostList({ page: 1, pageSize: 5 }, { excludeIds: paidLeaseIds }),
    listPublishedBlogArticles({ page: 1 }),
  ]);

  return <div className="homepage">
    <div className="home-shell home-wide-layout">
      <HomepageCompanyRail inventory={homeAds} trackingEnabled={!fixture} side="left" />
      <div className="home-center-content">
      {Object.values(homeAds).some(ads => ads.some(ad => ad.isSample)) && <p className="home-sample-notice">광고 구성 미리보기 · 샘플기업과 공고 조건은 허구이며, 선택하면 공개 목록으로 이동합니다.</p>}
      <HomepagePrimeCommercialZone inventory={homeAds} trackingEnabled={!fixture}>
        <HomeHero jobCount={jobResult.totalCount} leaseCount={leaseResult.totalCount} />
      </HomepagePrimeCommercialZone>
      <div className="home-lower-grid">
        <div className="home-lower-content">
          <HomepagePremiumSection inventory={homeAds} trackingEnabled={!fixture} />
          <HomepageGeneralSponsoredSection inventory={homeAds} trackingEnabled={!fixture} />
          <HomeLatestInformation jobs={jobResult.items.slice(0, 5)} leases={leaseResult.items} now={new Date()} />
          <HomeBlogSection articles={blogResult.items.slice(0, 6)} />
        </div>
        <HomeServiceRail />
      </div>
      </div>
      <HomepageCompanyRail inventory={homeAds} trackingEnabled={!fixture} side="right" />
    </div>
  </div>;
}
