import { describe, expect, it } from "vitest";
import {
  SEARCH_PAGE_SIZE,
  SEARCH_SOURCE_CANDIDATE_LIMIT,
  type SearchCandidate,
} from "@/lib/search/contract";
import { rankSearchCandidates } from "@/lib/search/ranking";
import { createUnifiedSearchPage } from "@/lib/search/service";
import {
  BLOG_SEARCH_SELECT,
  COMPANY_SEARCH_SELECT,
  JOB_SEARCH_SELECT,
  LEASE_SEARCH_SELECT,
  buildBlogSearchWhere,
  buildCompanySearchWhere,
  buildJobSearchWhere,
  buildLeaseSearchWhere,
} from "@/lib/search/source-contract";
import { parseUnifiedSearchRequest } from "@/lib/search/validation";

const now = new Date("2026-08-25T00:00:00.000Z");

describe("S21 unified search request contract", () => {
  it("normalizes bounded input and preserves canonical domain order", () => {
    expect(parseUnifiedSearchRequest({ q: "  ５톤   지입 ", domains: "blog,jobs", page: "2" })).toEqual({
      query: "5톤 지입",
      domains: ["JOBS", "BLOG"],
      page: 2,
      pageSize: SEARCH_PAGE_SIZE,
    });
  });

  it.each([
    [{}, "SEARCH_QUERY_REQUIRED"],
    [{ q: "한" }, "SEARCH_QUERY_INVALID"],
    [{ q: "지입", domains: "private" }, "SEARCH_DOMAINS_INVALID"],
    [{ q: "지입", page: "6" }, "SEARCH_PAGE_INVALID"],
    [{ q: ["지입", "화물"] }, "SEARCH_Q_REPEATED"],
  ])("rejects ambiguous or out-of-contract input %#", (params, code) => {
    expect(() => parseUnifiedSearchRequest(params)).toThrow(code);
  });
});

describe("S21 unified search public source contract", () => {
  it("requires records to be public, undeleted where applicable, and not future-published", () => {
    expect(buildJobSearchWhere("지입", now)).toEqual(expect.objectContaining({
      status: "OPEN",
      deletedAt: null,
      publishedAt: { lte: now, not: null },
    }));
    expect(buildLeaseSearchWhere("지입", now)).toEqual(expect.objectContaining({
      status: "PUBLISHED",
      deletedAt: null,
      publishedAt: { lte: now, not: null },
    }));
    expect(buildBlogSearchWhere("지입", now)).toEqual(expect.objectContaining({
      status: "PUBLISHED",
      publishedAt: { lte: now, not: null },
    }));
    expect(buildCompanySearchWhere("운송")).toEqual(expect.objectContaining({
      status: "ACTIVE",
      deletedAt: null,
    }));
  });

  it("allow-lists source fields and excludes identity, contact, answer, analytics, and credit data", () => {
    const serialized = JSON.stringify({
      JOB_SEARCH_SELECT,
      LEASE_SEARCH_SELECT,
      COMPANY_SEARCH_SELECT,
      BLOG_SEARCH_SELECT,
    });
    for (const forbidden of [
      "author",
      "phone",
      "email",
      "businessNumber",
      "correctOption",
      "explanation",
      "analytics",
      "credit",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("S21 unified search ranking contract", () => {
  it("ranks deterministically by match quality, publication time, domain, and id", () => {
    const candidates: SearchCandidate[] = [
      { id: "b", domain: "BLOG", title: "지입", body: "본문", href: "/blog/b", context: null, publishedAt: now },
      { id: "j", domain: "JOBS", title: "지입", body: null, href: "/jobs/j", context: null, publishedAt: now },
      { id: "l", domain: "LEASE", title: "지입 구인", body: null, href: "/lease/l", context: null, publishedAt: now },
      { id: "old", domain: "JOBS", title: "5톤 지입", body: null, href: "/jobs/old", context: null, publishedAt: new Date("2026-01-01") },
      { id: "body", domain: "BLOG", title: "운송 가이드", body: "지입 준비", href: "/blog/body", context: null, publishedAt: now },
      { id: "miss", domain: "JOBS", title: "택배", body: null, href: "/jobs/miss", context: null, publishedAt: now },
    ];

    const ranked = rankSearchCandidates("지입", candidates);
    expect(ranked.map((item) => item.id)).toEqual(["j", "b", "l", "old", "body"]);
    expect(ranked.map((item) => item.matchedOn)).toEqual([
      "TITLE_EXACT",
      "TITLE_EXACT",
      "TITLE_PREFIX",
      "TITLE_CONTAINS",
      "BODY_CONTAINS",
    ]);
    expect(Object.keys(ranked[0]).sort()).toEqual([
      "context",
      "domain",
      "excerpt",
      "href",
      "id",
      "matchedOn",
      "publishedAt",
      "title",
    ]);
  });

  it("bounds source candidates, reports the limit, and paginates after global ranking", () => {
    const candidates = Array.from(
      { length: SEARCH_SOURCE_CANDIDATE_LIMIT + 1 },
      (_, index): SearchCandidate => ({
        id: String(index).padStart(3, "0"),
        domain: "JOBS",
        title: `지입 공고 ${index}`,
        body: null,
        href: `/jobs/${index}`,
        context: null,
        publishedAt: new Date(now.getTime() - index * 1_000),
      }),
    );

    const page = createUnifiedSearchPage(
      {
        query: "지입",
        domains: ["JOBS"],
        page: 2,
        pageSize: SEARCH_PAGE_SIZE,
      },
      [{ domain: "JOBS", candidates }],
    );

    expect(page.candidateLimited).toBe(true);
    expect(page.totalMatches).toBe(SEARCH_SOURCE_CANDIDATE_LIMIT);
    expect(page.totalPages).toBe(4);
    expect(page.items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(page.items[0].id).toBe("020");
  });
});
