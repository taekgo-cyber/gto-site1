import { describe, expect, it } from "vitest";
import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from "@/lib/search/contract";
import { parseUnifiedSearchRequest } from "@/lib/search/validation";

describe("C4 unified search entry contract", () => {
  it("reuses S21 query length contract", () => {
    expect(SEARCH_QUERY_MIN_LENGTH).toBe(2);
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(100);
  });

  it("trims and normalizes homepage/header q-only submissions", () => {
    const req = parseUnifiedSearchRequest({ q: "  5톤 지입  " });
    expect(req.query).toBe("5톤 지입");
    expect(req.domains).toHaveLength(4);
    expect(req.page).toBe(1);
  });

  it("omitting domains/page defaults to all domains and page 1", () => {
    const req = parseUnifiedSearchRequest({ q: "화물" });
    expect(req.domains).toEqual(["JOBS", "LEASE", "COMPANIES", "BLOG"]);
    expect(req.page).toBe(1);
  });

  it("builds /search URL with encoded query", () => {
    const q = "5톤 지입";
    const url = `/search?q=${encodeURIComponent(q)}`;
    expect(url).toBe("/search?q=5%ED%86%A4%20%EC%A7%80%EC%9E%85");
  });

  it("homepage shortcuts cover all public primary routes", () => {
    const expected = ["/jobs", "/lease", "/cbt", "/companies", "/blog", "/support"];
    for (const href of expected) {
      expect(href.startsWith("/")).toBe(true);
    }
    expect(expected).toContain("/jobs");
    expect(expected).toContain("/lease");
  });
});
