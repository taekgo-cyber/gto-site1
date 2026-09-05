import { NextRequest, NextResponse } from "next/server";
import {
  AD_ATTRIBUTION_COOKIE,
  AD_ATTRIBUTION_MAX_AGE_SECONDS,
  recordAdvertisementClick,
} from "@/lib/analytics/ads";
import { logOperationalError } from "@/lib/observability/logger";
import {
  buildServerRequestKey,
  enforceRequestRateLimit,
  rateLimitResponse,
  SECURITY_RATE_LIMITS,
  SecurityRateLimitError,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  try {
    await enforceRequestRateLimit({
      headers: request.headers,
      scope: "ads:click",
      subject: campaignId,
      policy: SECURITY_RATE_LIMITS.adClick,
    });
    const { key: serverDedupeKey } = buildServerRequestKey({
      headers: request.headers,
      scope: "ads:click-dedupe",
      subject: campaignId,
      windowMs: 10 * 60_000,
    });
    const result = await recordAdvertisementClick({ campaignId, serverDedupeKey });
    const destination = new URL(result.destination, request.nextUrl.origin);
    const response = NextResponse.redirect(destination, 307);
    response.cookies.set(AD_ATTRIBUTION_COOKIE, result.attributionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AD_ATTRIBUTION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof SecurityRateLimitError) return rateLimitResponse(error);
    const code = error instanceof Error ? error.message : "";
    if (code === "ADVERTISEMENT_CAMPAIGN_NOT_TRACKABLE") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    logOperationalError({
      operation: "ad_click_record",
      actorType: "ANONYMOUS",
      category: "UNEXPECTED",
      error,
      identifiers: { campaignId, route: "/api/ads/click" },
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
