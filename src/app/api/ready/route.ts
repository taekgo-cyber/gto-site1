import { prisma } from "@/lib/prisma";
import { logOperationalError } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json(
      { status: "ready" },
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    logOperationalError({
      operation: "readiness_check",
      actorType: "SYSTEM",
      category: "DATABASE",
      error,
      identifiers: { route: "/api/ready" },
    });

    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers,
      },
    );
  }
}
