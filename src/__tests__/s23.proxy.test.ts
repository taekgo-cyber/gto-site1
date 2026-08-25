import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { proxy } from "@/proxy";

const originalAvailability = process.env.SITE_AVAILABILITY;

afterEach(() => {
  if (originalAvailability === undefined) delete process.env.SITE_AVAILABILITY;
  else process.env.SITE_AVAILABILITY = originalAvailability;
});

describe("S23 site availability proxy", () => {
  it("redirects public pages and returns 503 for mutation APIs during maintenance", () => {
    process.env.SITE_AVAILABILITY = "MAINTENANCE";
    const page = proxy(new NextRequest("https://example.com/jobs"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://example.com/maintenance");

    const api = proxy(new NextRequest("https://example.com/api/company/leads", { method: "POST" }));
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
    const anonymous = proxy(new NextRequest("https://example.com/mypage/lead"));
    expect(anonymous.status).toBe(307);
    expect(anonymous.headers.get("location")).toContain("/login?next=%2Fmypage%2Flead");

    const authenticated = proxy(new NextRequest("https://example.com/mypage", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=opaque-session` },
    }));
    expect(authenticated.headers.get("x-middleware-next")).toBe("1");
  });
});
