import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_REDIRECT,
  normalizeAuthRedirect,
} from "@/lib/auth/redirect";
import { getSiteUrl } from "@/lib/seo/site-url";
import { buildCompanyInquiryHref } from "@/lib/support/links";

describe("S24 launch validation contracts", () => {
  it("preserves a local auth destination including its query", () => {
    expect(normalizeAuthRedirect("/mypage/lead?page=2")).toBe(
      "/mypage/lead?page=2",
    );
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\\\evil.example/path",
    "/login",
    "/signup?next=/mypage",
  ])("rejects unsafe or looping auth destination %s", (value) => {
    expect(normalizeAuthRedirect(value)).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it("uses a non-crawlable build fallback but requires HTTPS for configured production origins", () => {
    expect(getSiteUrl({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: undefined })).toBe(
      "http://localhost:3000",
    );
    expect(getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: undefined })).toBe(
      "https://example.invalid",
    );
    expect(
      getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://service.example" }),
    ).toBe("https://service.example");
    expect(() =>
      getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://service.example" }),
    ).toThrow("SITE_URL_INVALID");
  });

  it("carries the public company identity into the existing inquiry funnel", () => {
    const href = buildCompanyInquiryHref({
      companyId: "company-1",
      companyName: "안전 운송",
    });
    const url = new URL(href, "https://service.example");
    expect(url.pathname).toBe("/support");
    expect(url.searchParams.get("category")).toBe("COMPANY_REGISTRATION");
    expect(url.searchParams.get("subject")).toContain("안전 운송");
    expect(url.searchParams.get("message")).toContain("company-1");
  });
});
