import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  HomepagePremiumSection,
  HomepagePrimeCommercialZone,
} from "@/components/ads/HomepageAdvertisementSections";
import { shouldAutoAdvanceCommercialRail } from "@/components/ads/CommercialRail";
import {
  getHomepageAdvertisementFixture,
  isHomepageAdvertisementFixtureEnabled,
  resolveHomepageAdvertisementFixture,
} from "@/lib/monetization/homepage-fixtures";
import {
  HOMEPAGE_AD_INVENTORY_CAPACITY,
  HOMEPAGE_AD_VISIBLE_SLOTS,
} from "@/lib/monetization/policy";
import { getRotationWindowKey, rotateAdvertisementCandidates } from "@/lib/monetization/rotation";
import { createViewabilityController } from "@/lib/monetization/viewability";

describe("Homepage Monetization V3 policy and rotation", () => {
  it("keeps sales capacity separate from visible slot policy", () => {
    expect(HOMEPAGE_AD_INVENTORY_CAPACITY).toEqual({
      MAIN: 8,
      PREMIUM: 20,
      GENERAL: null,
      COMPANY_LEFT: 4,
      COMPANY_RIGHT: 4,
    });
    expect(HOMEPAGE_AD_VISIBLE_SLOTS).toEqual({
      MAIN: 2,
      PREMIUM: 6,
      GENERAL: 6,
      COMPANY_LEFT: 1,
      COMPANY_RIGHT: 1,
    });
  });

  it("uses stable 30-minute windows and rotates in the next window", () => {
    const first = getRotationWindowKey(new Date("2026-08-31T00:01:00.000Z"));
    const same = getRotationWindowKey(new Date("2026-08-31T00:29:59.999Z"));
    const next = getRotationWindowKey(new Date("2026-08-31T00:30:00.000Z"));
    expect(same).toBe(first);
    expect(next).toBe(first + 1);
    const candidates = Array.from({ length: 7 }, (_, index) => ({ id: `campaign-${index}` }));
    expect(rotateAdvertisementCandidates({ candidates, visibleSlots: 2, windowKey: first, groupKey: "MAIN" }))
      .toEqual(rotateAdvertisementCandidates({ candidates, visibleSlots: 2, windowKey: first, groupKey: "MAIN" }));
    expect(rotateAdvertisementCandidates({ candidates, visibleSlots: 2, windowKey: next, groupKey: "MAIN" }))
      .not.toEqual(rotateAdvertisementCandidates({ candidates, visibleSlots: 2, windowKey: first, groupKey: "MAIN" }));
  });

  it.each([1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 17, 20])(
    "does not starve candidates and balances first position for candidate count %i",
    (candidateCount) => {
      const candidates = Array.from({ length: candidateCount }, (_, index) => ({ id: `campaign-${String(index).padStart(2, "0")}` }));
      const selectedCounts = new Map(candidates.map((candidate) => [candidate.id, 0]));
      const firstCounts = new Map(candidates.map((candidate) => [candidate.id, 0]));
      for (let windowKey = 0; windowKey < candidateCount; windowKey += 1) {
        const result = rotateAdvertisementCandidates({ candidates, visibleSlots: Math.min(6, candidateCount), windowKey, groupKey: "fairness" });
        for (const candidate of result) selectedCounts.set(candidate.id, selectedCounts.get(candidate.id)! + 1);
        firstCounts.set(result[0].id, firstCounts.get(result[0].id)! + 1);
      }
      expect(new Set(selectedCounts.values()).size).toBe(1);
      expect(new Set(firstCounts.values())).toEqual(new Set([1]));
    },
  );

  it("remains deterministic when candidates are added or removed", () => {
    const base = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const added = [...base, { id: "d" }];
    const removed = base.filter((candidate) => candidate.id !== "b");
    for (const candidates of [base, added, removed]) {
      const one = rotateAdvertisementCandidates({ candidates, visibleSlots: 2, windowKey: 12 });
      const two = rotateAdvertisementCandidates({ candidates, visibleSlots: 2, windowKey: 12 });
      expect(one).toEqual(two);
      expect(new Set(one.map((candidate) => candidate.id)).size).toBe(one.length);
    }
  });
});

describe("Homepage Monetization V3 empty and responsive rendering", () => {
  it("never promotes organic placeholders into an empty paid zone", () => {
    const empty = getHomepageAdvertisementFixture("empty");
    expect(renderToStaticMarkup(createElement(HomepagePrimeCommercialZone, { inventory: empty }))).toBe("");
    expect(renderToStaticMarkup(createElement(HomepagePremiumSection, { inventory: empty }))).toBe("");
  });

  it("shows two MAIN cards from a three-candidate pool and at most six PREMIUM cards", () => {
    expect(getHomepageAdvertisementFixture("main-3-pool").main).toHaveLength(2);
    expect(getHomepageAdvertisementFixture("main-full").main).toHaveLength(2);
    expect(getHomepageAdvertisementFixture("premium-full").premium).toHaveLength(6);
  });

  it("does not render an empty side rail and exposes mobile snap rails", () => {
    const html = renderToStaticMarkup(createElement(HomepagePrimeCommercialZone, {
      inventory: getHomepageAdvertisementFixture("one-side"),
    }));
    expect(html).toContain("추천 기업");
    expect(html).toContain("snap-mandatory");
    expect(html).not.toContain("banner-right-0");
  });

  it("disables the fixture in production", () => {
    expect(isHomepageAdvertisementFixtureEnabled("production")).toBe(false);
    expect(isHomepageAdvertisementFixtureEnabled("development")).toBe(true);
    expect(resolveHomepageAdvertisementFixture("full", "production")).toBeNull();
    expect(resolveHomepageAdvertisementFixture("full", "development")?.main).toHaveLength(2);
    expect(resolveHomepageAdvertisementFixture("unknown", "development")).toBeNull();
  });
});

describe("homepage commercial rail motion policy", () => {
  it("auto-advances only when hover, focus, and reduced-motion pauses are all inactive", () => {
    expect(shouldAutoAdvanceCommercialRail({ hovered: false, focusWithin: false, reducedMotion: false })).toBe(true);
    expect(shouldAutoAdvanceCommercialRail({ hovered: true, focusWithin: false, reducedMotion: false })).toBe(false);
    expect(shouldAutoAdvanceCommercialRail({ hovered: false, focusWithin: true, reducedMotion: false })).toBe(false);
    expect(shouldAutoAdvanceCommercialRail({ hovered: false, focusWithin: false, reducedMotion: true })).toBe(false);
  });
});

describe("viewable impression controller", () => {
  it("requires 50% continuous visibility for one second and records once", () => {
    const callbacks: Array<() => void> = [];
    const recorded = vi.fn();
    const dedupe = new Set<string>();
    const controller = createViewabilityController({
      campaignId: "campaign-1",
      dedupeSet: dedupe,
      isDocumentVisible: () => true,
      record: recorded,
      schedule: (callback) => { callbacks.push(callback); return callbacks.length as unknown as ReturnType<typeof setTimeout>; },
      cancel: () => undefined,
    });
    controller.setIntersection(0.49, true);
    expect(callbacks).toHaveLength(0);
    controller.setIntersection(0.5, true);
    expect(recorded).not.toHaveBeenCalled();
    callbacks.at(-1)!();
    expect(recorded).toHaveBeenCalledTimes(1);
    controller.setIntersection(1, true);
    expect(recorded).toHaveBeenCalledTimes(1);
  });

  it("does not record in a background document or after leaving before one second", () => {
    const callbacks: Array<() => void> = [];
    const recorded = vi.fn();
    let visible = false;
    const controller = createViewabilityController({
      campaignId: "campaign-2",
      dedupeSet: new Set(),
      isDocumentVisible: () => visible,
      record: recorded,
      schedule: (callback) => { callbacks.push(callback); return callbacks.length as unknown as ReturnType<typeof setTimeout>; },
      cancel: () => undefined,
    });
    controller.setIntersection(1, true);
    expect(callbacks).toHaveLength(0);
    visible = true;
    controller.handleVisibilityChange();
    controller.setIntersection(0, false);
    callbacks.at(-1)!();
    expect(recorded).not.toHaveBeenCalled();
  });

  it("deduplicates remounts with the shared page set", () => {
    const dedupe = new Set<string>();
    const recorded = vi.fn();
    const make = () => {
      const callbacks: Array<() => void> = [];
      const controller = createViewabilityController({
        campaignId: "page:campaign-3",
        dedupeSet: dedupe,
        isDocumentVisible: () => true,
        record: recorded,
        schedule: (next) => { callbacks.push(next); return 1 as unknown as ReturnType<typeof setTimeout>; },
        cancel: () => undefined,
      });
      controller.setIntersection(1, true);
      callbacks[0]?.();
    };
    make();
    make();
    expect(recorded).toHaveBeenCalledTimes(1);
  });
});
