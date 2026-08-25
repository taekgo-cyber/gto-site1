import { timingSafeEqual } from "node:crypto";
import { dispatchPendingOpsEvents, enqueueDailyOpsDigest } from "@/lib/ops/service";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.OPS_AUTOMATION_CRON_SECRET?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return secret.length >= 32 && supplied.length === secret.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await enqueueDailyOpsDigest();
  const result = await dispatchPendingOpsEvents({});
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
