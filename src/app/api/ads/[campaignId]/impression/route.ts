import { recordAdvertisementImpression } from "@/lib/analytics/ads";
import { logOperationalError } from "@/lib/observability/logger";
import {
  buildServerRequestKey,
  enforceRequestRateLimit,
  rateLimitResponse,
  SECURITY_RATE_LIMITS,
  SecurityRateLimitError,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  try {
    await enforceRequestRateLimit({
      headers: request.headers,
      scope: "ads:impression",
      subject: campaignId,
      policy: SECURITY_RATE_LIMITS.adImpression,
    });
    const { key: serverDedupeKey } = buildServerRequestKey({
      headers: request.headers,
      scope: "ads:impression-dedupe",
      subject: campaignId,
      windowMs: 30 * 60_000,
    });
    const result = await recordAdvertisementImpression({ campaignId, serverDedupeKey });
    return Response.json(result, { status: result.recorded ? 201 : 200 });
  } catch (error) {
    if (error instanceof SecurityRateLimitError) return rateLimitResponse(error);
    const code = error instanceof Error ? error.message : "";
    if (code === "ADVERTISEMENT_IMPRESSION_DEDUPE_INVALID") {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    if (code === "ADVERTISEMENT_CAMPAIGN_NOT_TRACKABLE") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    logOperationalError({
      operation: "ad_impression_record",
      actorType: "ANONYMOUS",
      category: "UNEXPECTED",
      error,
      identifiers: { campaignId, route: "/api/ads/impression" },
    });
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
