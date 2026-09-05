import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class RateLimitError extends Error {
    retryAfterSeconds: number;
    constructor(retryAfterSeconds: number) {
      super("SECURITY_RATE_LIMITED");
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
  return {
    impression: vi.fn(), click: vi.fn(), enforce: vi.fn(), buildKey: vi.fn(),
    log: vi.fn(), RateLimitError,
  };
});

vi.mock("@/lib/analytics/ads", () => ({
  AD_ATTRIBUTION_COOKIE: "gto_ad_attribution",
  AD_ATTRIBUTION_MAX_AGE_SECONDS: 2_592_000,
  recordAdvertisementImpression: mocks.impression,
  recordAdvertisementClick: mocks.click,
}));
vi.mock("@/lib/observability/logger", () => ({ logOperationalError: mocks.log }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRequestRateLimit: mocks.enforce,
  buildServerRequestKey: mocks.buildKey,
  SecurityRateLimitError: mocks.RateLimitError,
  rateLimitResponse: (error: { retryAfterSeconds: number }) =>
    Response.json({ error: "RATE_LIMITED" }, {
      status: 429,
      headers: { "Retry-After": String(error.retryAfterSeconds) },
    }),
  SECURITY_RATE_LIMITS: {
    adImpression: { limit: 120, windowMs: 600_000 },
    adClick: { limit: 30, windowMs: 600_000 },
  },
}));

import { POST as impressionRoute } from "@/app/api/ads/[campaignId]/impression/route";
import { GET as clickRoute } from "@/app/api/ads/[campaignId]/click/route";

const context = { params: Promise.resolve({ campaignId: "campaign-1" }) };

describe("Security P0 ad route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforce.mockResolvedValue(undefined);
    mocks.buildKey.mockReturnValue({ key: "server-derived-window-key", windowStart: new Date() });
    mocks.impression.mockResolvedValue({ recorded: true, eventId: "event-1" });
    mocks.click.mockResolvedValue({
      recorded: false,
      duplicate: true,
      eventId: "click-1",
      attributionToken: "opaque-attribution",
      destination: "/jobs/1",
    });
  });

  it("ignores a client-controlled impression dedupe value", async () => {
    const request = new Request("https://service.example/api/ads/campaign-1/impression", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ dedupeKey: "attacker-controlled" }),
    });
    const response = await impressionRoute(request, context);
    expect(response.status).toBe(201);
    expect(mocks.impression).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      serverDedupeKey: "server-derived-window-key",
    });
    expect(JSON.stringify(mocks.impression.mock.calls)).not.toContain("attacker-controlled");
  });

  it("lets a deduped click redirect normally without another billable event", async () => {
    const request = new NextRequest("https://service.example/api/ads/campaign-1/click", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const response = await clickRoute(request, context);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://service.example/jobs/1");
    expect(response.headers.get("set-cookie"))
      .toContain("gto_ad_attribution=opaque-attribution");
    expect(mocks.click).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      serverDedupeKey: "server-derived-window-key",
    });
  });
});
