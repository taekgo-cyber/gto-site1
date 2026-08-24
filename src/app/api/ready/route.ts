import { prisma } from "@/lib/prisma";

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
    console.error("readiness_check_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
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
