import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getJobPostList } from "@/lib/jobs/dal";
import { getPostList } from "@/lib/posts/dal";
import { listPublishedBlogArticles } from "@/lib/blog/dal";
import { listHomepageAdvertisementInventory } from "@/lib/monetization/homepage-ads";
import { getHomepageAdvertisementFixture } from "@/lib/monetization/homepage-fixtures";
import { HomepageGeneralSponsoredSection, HomepageMonthlyBannerSection, HomepageCompanyRail } from "@/components/ads/HomepageAdvertisementSections";

vi.mock("@/lib/jobs/dal", () => ({ getJobPostList: vi.fn() }));
vi.mock("@/lib/posts/dal", () => ({ getPostList: vi.fn() }));
vi.mock("@/lib/blog/dal", () => ({ listPublishedBlogArticles: vi.fn() }));
vi.mock("@/lib/monetization/homepage-ads", () => ({ listHomepageAdvertisementInventory: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJobPostList).mockResolvedValue({ items: [], totalCount: 0 });
  vi.mocked(getPostList).mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 5, totalPages: 0 });
  vi.mocked(listPublishedBlogArticles).mockResolvedValue({ items: [], page: 1, totalPages: 1, total: 0 });
  vi.mocked(listHomepageAdvertisementInventory).mockResolvedValue(getHomepageAdvertisementFixture("empty"));
});
afterEach(() => vi.unstubAllEnvs());

describe("homepage reference integration preserves the data contract", () => {
  it("automatically fills the real empty development homepage without polluting organic exclusions", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_HOMEPAGE_SAMPLE_INVENTORY", "");
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("광고 구성 미리보기");
    expect(html).not.toContain("/api/ads/");
    expect(html.match(/class="home-main-card /g)).toHaveLength(20);
    expect(html.match(/class="home-premium-card /g)).toHaveLength(30);
    expect(getJobPostList).toHaveBeenCalledWith({ page: 1, excludeIds: [] });
    expect(getPostList).toHaveBeenCalledWith({ page: 1, pageSize: 5 }, { excludeIds: [] });
  });

  it("keeps production empty even when a sample flag and fixture URL are supplied", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_HOMEPAGE_SAMPLE_INVENTORY", "true");
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ adFixture: "full" }) }));
    expect(html).not.toContain("data-ad-campaign-id");
    expect(html).not.toContain("광고 구성 미리보기");
    expect(listHomepageAdvertisementInventory).toHaveBeenCalledOnce();
  });
  it("collapses every empty paid placement while keeping organic discovery and search", async () => {
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("data-ad-campaign-id");
    expect(html).not.toContain("MONTHLY BANNER");
    expect(html).toContain('action="/search"');
    expect(html).toContain("최신 구인 정보");
    expect(html).toContain("최신 지입·차량 정보");
    expect(html).toContain("운전자를 위한 필수 서비스");
    expect(html).toContain("운전 생활 &amp; 물류 정보");
    for (const Component of [HomepageGeneralSponsoredSection, HomepageMonthlyBannerSection, HomepageCompanyRail]) {
      expect(renderToStaticMarkup(createElement(Component, { inventory: getHomepageAdvertisementFixture("empty") }))).toBe("");
    }
  });

  it("passes all paid listing IDs to both organic exclusions and retains tracked campaign links", async () => {
    const inventory = getHomepageAdvertisementFixture("full");
    for (const ads of Object.values(inventory)) for (const ad of ads) ad.isSample = false;
    inventory.main[0] = { ...inventory.main[0], jobPostId: null, leasePostId: "paid-lease" };
    vi.mocked(listHomepageAdvertisementInventory).mockResolvedValue(inventory);
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    const paid = [...inventory.main, ...inventory.premium, ...inventory.general];
    expect(getJobPostList).toHaveBeenCalledWith({ page: 1, excludeIds: paid.flatMap(ad => ad.jobPostId ? [ad.jobPostId] : []) });
    expect(getPostList).toHaveBeenCalledWith({ page: 1, pageSize: 5 }, { excludeIds: ["paid-lease"] });
    for (const ad of [...paid, ...inventory.companyLeft, ...inventory.companyRight]) {
      expect(html).toContain(`/api/ads/${ad.id}/click`);
    }
    expect(html.match(/class="home-main-card /g)).toHaveLength(20);
    expect(html.match(/class="home-premium-card /g)).toHaveLength(30);
    expect(html.indexOf("1. 주요 공고")).toBeLessThan(html.indexOf("2. 기업 광고"));
    expect(html.indexOf("4. 스폰서 공고")).toBeLessThan(html.indexOf("5. 최신 구인 정보"));
  });

  it("uses published CMS records, not local image filenames, as article links", async () => {
    vi.mocked(listPublishedBlogArticles).mockResolvedValue({ items: [{
      id: "published", slug: "published-guide", title: "발행된 운전 가이드", excerpt: null, tags: [],
      featuredImageUrl: null, featuredImageAlt: null, publishedAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-01T00:00:00Z"), category: null,
    }], page: 1, totalPages: 1, total: 1 });
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/blog/published-guide"');
    expect(html).not.toContain('href="/blog/lease-tonnage-choice-beginners-featured"');
    expect(html).not.toContain("1588-1234");
    expect(html).not.toContain("App Store");
  });
});
