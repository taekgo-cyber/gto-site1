import { recordAdvertisementImpression } from "@/lib/analytics/ads";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const dedupeKey = body && typeof body === "object" && "dedupeKey" in body
    ? (body as { dedupeKey?: unknown }).dedupeKey
    : null;
  if (typeof dedupeKey !== "string") {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const { campaignId } = await params;
  try {
    const result = await recordAdvertisementImpression({ campaignId, dedupeKey });
    return Response.json(result, { status: result.recorded ? 201 : 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "ADVERTISEMENT_IMPRESSION_DEDUPE_INVALID") {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    if (code === "ADVERTISEMENT_CAMPAIGN_NOT_TRACKABLE") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
