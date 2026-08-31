import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdPlacementSlot, type PublicAd } from "@/components/ads/AdPlacementSlot";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";

const ads: PublicAd[] = [
  {
    id: "main-campaign",
    title: "수도권 5톤 운송기사 모집",
    imageUrl: null,
    linkUrl: "/jobs/main",
    companyName: "메인운송",
    recruitmentTier: "MAIN",
  },
  {
    id: "premium-campaign",
    title: "프리미엄 기업 광고",
    imageUrl: null,
    linkUrl: "/companies/premium",
    companyName: "프리미엄물류",
    recruitmentTier: "PREMIUM",
  },
];

describe("homepage search and monetization closeout", () => {
  it("submits the shared bounded query contract to /search", () => {
    const html = renderToStaticMarkup(createElement(UnifiedSearchForm, {
      formId: "home-search",
      inputId: "home-search-input",
      ariaLabel: "홈 통합검색",
      variant: "hero",
    }));

    expect(html).toContain('action="/search"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('minLength="2"');
    expect(html).toContain('maxLength="100"');
  });

  it("collapses the advertisement area completely when no campaign is eligible", () => {
    expect(renderToStaticMarkup(createElement(AdPlacementSlot, { campaigns: [] }))).toBe("");
  });

  it("renders tier labels, tracked click URLs, and responsive side-banner structure", () => {
    const html = renderToStaticMarkup(createElement(AdPlacementSlot, { campaigns: ads }));

    expect(html).toContain("메인 광고");
    expect(html).toContain("프리미엄");
    expect(html).toContain('/api/ads/main-campaign/click');
    expect(html).toContain('/api/ads/premium-campaign/click');
    expect(html).toContain("lg:grid-cols-[13rem_minmax(0,1fr)_13rem]");
    expect(html).toContain("min-w-0");
  });
});
