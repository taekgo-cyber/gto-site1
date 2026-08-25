import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { resolveRuntimeSiteAvailability } from "@/lib/launch/policy";

function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname === "/maintenance" ||
    pathname === "/login" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/admin") ||
    pathname === "/api/health" ||
    pathname === "/api/ready" ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/telegram/")
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (resolveRuntimeSiteAvailability() === "MAINTENANCE" && !isMaintenanceExempt(pathname)) {
    if (pathname.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
      return NextResponse.json(
        { status: "maintenance" },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
      );
    }
    return NextResponse.redirect(new URL("/maintenance", request.url), 307);
  }

  if (pathname.startsWith("/mypage") && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
