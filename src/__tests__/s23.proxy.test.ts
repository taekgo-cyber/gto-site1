import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { proxy } from "@/proxy";

const originalAvailability = process.env.SITE_AVAILABILITY;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalAvailability === undefined) delete process.env.SITE_AVAILABILITY;
  else process.env.SITE_AVAILABILITY = originalAvailability;
});

describe("S23 site availability proxy", () => {
  it("redirects public pages and returns 503 for mutation APIs during maintenance", () => {
    process.env.SITE_AVAILABILITY = "MAINTENANCE";
    const page = proxy(new NextRequest("https://example.com/jobs"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://example.com/maintenance");

    const api = proxy(new NextRequest("https://example.com/api/company/leads", {
      method: "POST",
      headers: { origin: "https://example.com" },
    }));
    expect(api.status).toBe(503);
    expect(api.headers.get("retry-after")).toBe("300");
  });

  it("keeps health and admin operations available during maintenance", () => {
    process.env.SITE_AVAILABILITY = "MAINTENANCE";
    expect(proxy(new NextRequest("https://example.com/api/health")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest("https://example.com/admin/ops")).headers.get("x-middleware-next")).toBe("1");
  });

  it("preserves the existing mypage session boundary in PUBLIC mode", () => {
    process.env.SITE_AVAILABILITY = "PUBLIC";
    const anonymous = proxy(new NextRequest("https://example.com/mypage/lead?page=2"));
    expect(anonymous.status).toBe(307);
    expect(anonymous.headers.get("location")).toContain("/login?next=%2Fmypage%2Flead%3Fpage%3D2");

    const authenticated = proxy(new NextRequest("https://example.com/mypage", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=opaque-session` },
    }));
    expect(authenticated.headers.get("x-middleware-next")).toBe("1");
  });

  it("preserves protected company journeys through login", () => {
    process.env.SITE_AVAILABILITY = "PUBLIC";
    const anonymous = proxy(new NextRequest("https://example.com/company/leads?companyId=company-1"));
    expect(anonymous.status).toBe(307);
    expect(anonymous.headers.get("location")).toContain(
      "/login?next=%2Fcompany%2Fleads%3FcompanyId%3Dcompany-1",
    );
  });

  it("rejects cross-origin mutations and allows a legitimate same-origin request", () => {
    process.env.SITE_AVAILABILITY = "PUBLIC";
    const blocked = proxy(new NextRequest("https://service.example/api/posts", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "service.example",
        "sec-fetch-site": "cross-site",
      },
    }));
    expect(blocked.status).toBe(403);

    const allowed = proxy(new NextRequest("https://service.example/api/posts", {
      method: "POST",
      headers: {
        origin: "https://service.example",
        host: "service.example",
        "sec-fetch-site": "same-origin",
      },
    }));
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects missing-origin writes except explicit authenticated server-to-server routes", () => {
    process.env.SITE_AVAILABILITY = "PUBLIC";
    expect(proxy(new NextRequest("https://example.com/api/posts", { method: "POST" })).status)
      .toBe(403);
    expect(proxy(new NextRequest("https://example.com/api/posts", {
      method: "POST",
      headers: { referer: "https://example.com/posts/new" },
    })).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest("https://example.com/api/cron/ops", { method: "POST" }))
      .headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest("https://example.com/api/telegram/webhook", { method: "POST" }))
      .headers.get("x-middleware-next")).toBe("1");
  });

  it("adds production HSTS without preload only on HTTPS production responses", () => {
    process.env.SITE_AVAILABILITY = "PUBLIC";
    vi.stubEnv("NODE_ENV", "production");
    const secure = proxy(new NextRequest("https://service.example/api/ready"));
    expect(secure.headers.get("strict-transport-security"))
      .toBe("max-age=31536000; includeSubDomains");
    expect(secure.headers.get("content-security-policy"))
      .toContain("upgrade-insecure-requests");

    const local = proxy(new NextRequest("http://localhost:3000/api/ready"));
    expect(local.headers.get("strict-transport-security")).toBeNull();
    expect(local.headers.get("content-security-policy")).toBeNull();
  });
});
