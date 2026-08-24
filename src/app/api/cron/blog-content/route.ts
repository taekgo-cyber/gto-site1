import { randomUUID, timingSafeEqual } from "node:crypto";
import { processDueBlogContentJobs } from "@/lib/blog/automation";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.BLOG_AUTOMATION_CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const result = await processDueBlogContentJobs({ runnerId: `cron:${randomUUID()}` });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
