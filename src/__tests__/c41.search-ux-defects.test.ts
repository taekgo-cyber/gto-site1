import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pagination } from "@/components/jobs/Pagination";
import { createUnifiedSearchPage } from "@/lib/search/service";
import { parseUnifiedSearchRequest } from "@/lib/search/validation";
import { isSearchRequestValidationError } from "@/lib/search/validation";

describe("C4.1 defect 1 — domain state preservation", () => {
  it.each([
    [{ q: "화물" }, ["JOBS", "LEASE", "COMPANIES", "BLOG"]],
    [{ q: "화물", domains: "" }, ["JOBS", "LEASE", "COMPANIES", "BLOG"]],
    [{ q: "화물", domains: "JOBS" }, ["JOBS"]],
    [{ q: "화물", domains: "LEASE" }, ["LEASE"]],
    [{ q: "화물", domains: "COMPANIES" }, ["COMPANIES"]],
    [{ q: "화물", domains: "BLOG" }, ["BLOG"]],
    [{ q: "화물", domains: "JOBS,LEASE" }, ["JOBS", "LEASE"]],
    [{ q: "화물", domains: "JOBS,BLOG" }, ["JOBS", "BLOG"]],
    [{ q: "화물", domains: "LEASE,BLOG" }, ["LEASE", "BLOG"]],
    [{ q: "화물", domains: "JOBS,LEASE,COMPANIES,BLOG" }, ["JOBS", "LEASE", "COMPANIES", "BLOG"]],
  ])("preserves domain set %#", (params, expected) => {
    expect(parseUnifiedSearchRequest(params).domains).toEqual(expected);
  });

  it("round-trips JOBS,BLOG without expansion to all", () => {
    const req = parseUnifiedSearchRequest({ q: "화물", domains: "JOBS,BLOG" });
    const serialized = req.domains.join(",");
    expect(serialized).toBe("JOBS,BLOG");
    expect(parseUnifiedSearchRequest({ q: "화물", domains: serialized }).domains).toEqual([
      "JOBS",
      "BLOG",
    ]);
  });

  it("explicit all triple is semantically all", () => {
    const req = parseUnifiedSearchRequest({ q: "화물", domains: "JOBS,LEASE,COMPANIES,BLOG" });
    expect(req.domains).toEqual(["JOBS", "LEASE", "COMPANIES", "BLOG"]);
  });
});

describe("C4.1 defect 2 — error classification", () => {
  it("classifies validation errors", () => {
    expect(isSearchRequestValidationError(new Error("SEARCH_QUERY_INVALID"))).toBe(true);
    expect(isSearchRequestValidationError(new Error("SEARCH_DOMAINS_INVALID"))).toBe(true);
    expect(isSearchRequestValidationError(new Error("SEARCH_PAGE_INVALID"))).toBe(true);
    expect(isSearchRequestValidationError(new Error("SEARCH_Q_REPEATED"))).toBe(true);
    expect(isSearchRequestValidationError(new Error("SEARCH_DOMAINS_REPEATED"))).toBe(true);
  });

  it("does not classify system failures as validation", () => {
    expect(isSearchRequestValidationError(new Error("db down"))).toBe(false);
    expect(isSearchRequestValidationError(new Error("ECONNREFUSED"))).toBe(false);
    const prismaLike = Object.assign(new Error("db"), { code: "P1001" });
    expect(isSearchRequestValidationError(prismaLike)).toBe(false);
    expect(isSearchRequestValidationError("string")).toBe(false);
  });
});

describe("C4.1 defect 3 — empty page messaging semantics", () => {
  it("total 0 is distinct from empty current page with total > 0", () => {
    const now = new Date("2026-08-25T00:00:00.000Z");
    const base = { query: "지입", domains: ["JOBS"] as unknown as ["JOBS"], pageSize: 20 as const };

    const empty = createUnifiedSearchPage({ ...base, page: 1 }, [
      { domain: "JOBS", candidates: [] },
    ]);
    expect(empty.totalMatches).toBe(0);
    expect(empty.items).toHaveLength(0);

    const candidates = Array.from({ length: 5 }, (_, i) => ({
      id: `id-${i}`,
      domain: "JOBS" as const,
      title: `지입 ${i}`,
      body: "본문 지입",
      href: `/jobs/${i}`,
      context: null,
      publishedAt: now,
    }));
    const outOfRange = createUnifiedSearchPage({ ...base, page: 5 }, [
      { domain: "JOBS", candidates },
    ]);
    expect(outOfRange.totalMatches).toBe(5);
    expect(outOfRange.totalPages).toBe(1);
    expect(outOfRange.items).toHaveLength(0);
  });
});

describe("C4.1 defect 4 — pagination disabled semantics", () => {
  it("renders previous as non-link when on first page", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, {
        currentPage: 1,
        totalPages: 5,
        query: { q: "화물" },
        basePath: "/search",
      }),
    );
    expect(html).toContain("이전");
    expect(html).not.toContain('href="/search?q=%ED%99%94%EB%AC%BC&amp;page=0"');
    expect(html).not.toContain('href="/search?q=%ED%99%94%EB%AC%BC&amp;page=1"');
    // disabled previous should be span with aria-disabled
    expect(html).toContain('aria-disabled="true"');
    // next should be link
    expect(html).toContain('href="/search?q=%ED%99%94%EB%AC%BC&amp;page=2"');
  });

  it("renders next as non-link when on last page", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, {
        currentPage: 5,
        totalPages: 5,
        query: { q: "화물" },
        basePath: "/search",
      }),
    );
    expect(html).toContain("다음");
    // no link to page 6
    expect(html).not.toContain("page=6");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('href="/search?q=%ED%99%94%EB%AC%BC&amp;page=4"');
  });

  it("renders both prev/next as links on middle page", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, {
        currentPage: 3,
        totalPages: 5,
        query: { q: "화물" },
        basePath: "/search",
      }),
    );
    expect(html).toContain('href="/search?q=%ED%99%94%EB%AC%BC&amp;page=2"');
    expect(html).toContain('href="/search?q=%ED%99%94%EB%AC%BC&amp;page=4"');
    // disabled spans should not appear
    const disabledCount = (html.match(/aria-disabled="true"/g) ?? []).length;
    expect(disabledCount).toBe(0);
  });

  it("disabled markup has no href", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, {
        currentPage: 1,
        totalPages: 3,
        query: { q: "화물" },
        basePath: "/search",
      }),
    );
    // extract the disabled previous span fragment and ensure no href there
    const beforeNext = html.split("다음")[0];
    // the first aria-disabled span should not contain href
    expect(beforeNext).toContain('<span');
    expect(beforeNext.split('<span')[1].split("</span>")[0]).not.toContain("href=");
  });
});

describe("C4.1 regression — C4 entry still q-only", () => {
  it("homepage/header q-only entry defaults to all domains and page 1", () => {
    expect(parseUnifiedSearchRequest({ q: " 5톤 지입 " }).domains).toHaveLength(4);
    expect(parseUnifiedSearchRequest({ q: "5톤 지입" }).page).toBe(1);
  });
});
