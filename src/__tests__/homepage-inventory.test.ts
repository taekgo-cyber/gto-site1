import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHomepageSampleInventory, homepageAdTracking, isHomepageSampleFillEnabled, mergeHomepageSampleInventory } from "@/lib/monetization/homepage-samples";
import { createAdvertisementPager, splitAdvertisementPages } from "@/lib/monetization/homepage-pages";
import { HOMEPAGE_AD_VISIBLE_SLOTS } from "@/lib/monetization/policy";
import { MainAdCard } from "@/components/ads/MainAdCard";
import { PremiumAdCard } from "@/components/ads/PremiumAdCard";
import { GeneralAdCard } from "@/components/ads/GeneralAdCard";
import { CompanyBanner } from "@/components/ads/CompanyBanner";
import { AdViewabilityTracker } from "@/components/ads/AdViewabilityTracker";
import { HomepageCompanyRail } from "@/components/ads/HomepageAdvertisementSections";
import { getHomepageAdvertisementFixture } from "@/lib/monetization/homepage-fixtures";

describe("homepage full inventory contract", () => {
  it.each([["main", 20, 10], ["premium", 30, 15], ["general", 40, 20]] as const)("retains %s total %i and two disjoint pages of %i", (key, count, size) => {
    const ads = createHomepageSampleInventory()[key];
    expect(ads).toHaveLength(count);
    expect(HOMEPAGE_AD_VISIBLE_SLOTS[key.toUpperCase() as "MAIN" | "PREMIUM" | "GENERAL"]).toBe(size);
    const pages = splitAdvertisementPages(ads, size);
    expect(pages.map(p => p.length)).toEqual([size, size]);
    expect(new Set(pages.flat().map(a => a.id)).size).toBe(count);
    expect(splitAdvertisementPages([...ads, ads[0]], size)).toEqual(pages);
  });
  it("has 102 unique synthetic records, local images, safe targets and six banners on either side", () => {
    const inventory = createHomepageSampleInventory();
    const ads = Object.values(inventory).flat();
    expect(ads).toHaveLength(102);
    expect(new Set(ads.map(a => a.id)).size).toBe(102);
    expect(new Set(ads.map(a => a.title)).size).toBeGreaterThan(50);
    expect(new Set(ads.map(a => a.listing?.originRegionName)).size).toBeGreaterThan(14);
    for (const ad of ads) {
      expect(ad.isSample).toBe(true);
      expect(ad.companyName).toMatch(/^샘플/);
      expect(ad.jobPostId).toBeNull(); expect(ad.leasePostId).toBeNull();
      expect(["/jobs", "/lease", "/companies"]).toContain(ad.linkUrl);
      expect(ad.imageUrl).toMatch(/^\/images\/blog\//);
      expect(existsSync(`public${ad.imageUrl}`)).toBe(true);
    }
    for (const side of ["left", "right"] as const) {
      const html = renderToStaticMarkup(createElement(HomepageCompanyRail, { inventory, side }));
      expect(html.match(/data-ad-campaign-id=/g)).toHaveLength(6);
    }
  });
  it("fills only deficits, retaining real-first order and eliminating duplicate campaigns and targets", () => {
    const source = createHomepageSampleInventory();
    const real = getHomepageAdvertisementFixture("empty");
    for (const [key, count] of [["main",3],["premium",8],["general",15],["companyLeft",2],["companyRight",2]] as const) {
      real[key] = source[key].slice(0, count).map((ad, i) => ({ ...ad, id: `real-${key}-${i}`, isSample: false, jobPostId: key.startsWith("company") ? null : `job-${key}-${i}` }));
    }
    real.main.push(real.main[0]);
    real.premium.push({ ...real.main[0], id: "duplicate-target", recruitmentTier: "PREMIUM" });
    const merged = mergeHomepageSampleInventory(real);
    expect(Object.values(merged).map(ads => ads.filter(a => a.isSample).length)).toEqual([17,22,25,4,4]);
    for (const key of Object.keys(merged) as (keyof typeof merged)[]) {
      expect(merged[key][0]).toEqual(real[key][0]);
      expect(merged[key].findIndex(a => a.isSample)).toBe(real[key].filter((a, i, all) => all.findIndex(b => b.id === a.id) === i && a.id !== "duplicate-target").length);
    }
    expect(new Set(Object.values(merged).flat().map(a => a.id)).size).toBe(102);
    expect(real.main).toHaveLength(4); // input not mutated
  });
  it("never fills above capacity and displaces samples as real inventory grows", () => {
    const real = createHomepageSampleInventory();
    for (const ads of Object.values(real)) for (const ad of ads) { ad.isSample = false; ad.id = `real-${ad.id}`; }
    real.main.push({ ...real.main[0], id: "over-capacity" });
    const result = mergeHomepageSampleInventory(real);
    expect(result.main).toHaveLength(20);
    expect(Object.values(result).flat().some(ad => ad.isSample)).toBe(false);
  });
  it("defaults on only in development, supports local opt-out, and cannot enable production samples", () => {
    expect(isHomepageSampleFillEnabled("development")).toBe(true);
    expect(isHomepageSampleFillEnabled("development", "false")).toBe(false);
    expect(isHomepageSampleFillEnabled("development", "0")).toBe(false);
    for (const flag of [undefined, "true", "false"]) expect(isHomepageSampleFillEnabled("production", flag)).toBe(false);
    expect(isHomepageSampleFillEnabled("test")).toBe(false);
  });
  it.each([MainAdCard, PremiumAdCard, GeneralAdCard, CompanyBanner])("bypasses BOTH viewability and click tracking for samples in every card", Card => {
    const sample = createHomepageSampleInventory().main[0];
    const element = Card({ advertisement: sample, trackingEnabled: true });
    expect(element.type).toBe(AdViewabilityTracker);
    expect(element.props.enabled).toBe(false);
    const html = renderToStaticMarkup(element);
    expect(html).not.toContain("/api/ads/");
    expect(html).toContain(`href="${sample.linkUrl}"`);
    const real = { ...sample, isSample: false, id: "real-campaign" };
    expect(Card({ advertisement: real }).props.enabled).toBe(true);
    expect(homepageAdTracking(real)).toEqual({ enabled: true, href: "/api/ads/real-campaign/click" });
  });
  it("contains explicit responsive grids without hiding either company's inventory", () => {
    const css = readFileSync("src/app/homepage.css", "utf8");
    expect(css).toContain("@media (min-width: 1600px)");
    expect(css).toContain(".home-main-cards, .home-premium-cards { grid-template-columns: repeat(2,minmax(0,1fr))");
    expect(css).toContain(".home-ad-page[hidden] { display: none; }");
  });
});

describe("shared five-second advertisement pager", () => {
  afterEach(() => vi.useRealTimers());
  it("cycles A → B → A and resets a full interval after manual navigation", () => {
    vi.useFakeTimers(); const change = vi.fn(); const pager = createAdvertisementPager(2, change); pager.start();
    vi.advanceTimersByTime(4999); expect(change).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(change).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(5000); expect(change).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(4900); pager.move(-1); expect(change).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(100); expect(change).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(4900); expect(change).toHaveBeenLastCalledWith(0);
    pager.dispose(); vi.advanceTimersByTime(10000); expect(change).toHaveBeenCalledTimes(4);
  });
  it.each(["hover", "focus", "motion", "user", "hidden"] as const)("pauses for %s, permits manual arrows, and resumes after a full interval", reason => {
    vi.useFakeTimers(); const change = vi.fn(); const pager = createAdvertisementPager(2, change); pager.start();
    vi.advanceTimersByTime(4000); pager.pause(reason, true); vi.advanceTimersByTime(10000); expect(change).not.toHaveBeenCalled();
    pager.move(1); expect(change).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(10000); expect(change).toHaveBeenCalledTimes(1);
    pager.pause(reason, false); vi.advanceTimersByTime(4999); expect(change).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(change).toHaveBeenLastCalledWith(0); pager.dispose();
  });
  it("mouse leave does not override focus, and a single page never rotates", () => {
    vi.useFakeTimers(); const change = vi.fn(); const pager = createAdvertisementPager(2, change);
    pager.pause("hover", true); pager.pause("focus", true); pager.pause("hover", false);
    vi.advanceTimersByTime(10000); expect(change).not.toHaveBeenCalled(); pager.dispose();
    const single = createAdvertisementPager(1, change); single.start(); vi.advanceTimersByTime(10000); expect(change).not.toHaveBeenCalled(); single.dispose();
  });
});
