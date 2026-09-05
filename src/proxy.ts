import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { resolveRuntimeSiteAvailability } from "@/lib/launch/policy";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PRODUCTION_CSP =
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests";

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

export function isSameOriginMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin || referer;
  if (!source) {
    return request.nextUrl.pathname.startsWith("/api/cron/") ||
      request.nextUrl.pathname === "/api/telegram/webhook";
  }

  try {
    const originUrl = new URL(source);
    const expectedHost =
      firstHeaderValue(request.headers.get("x-forwarded-host")) ||
      firstHeaderValue(request.headers.get("host")) ||
      request.nextUrl.host;
    const expectedProtocol =
      firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
      request.nextUrl.protocol.replace(":", "");
    return originUrl.host === expectedHost && originUrl.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

function withRuntimeSecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const isHttps = forwardedProtocol === "https" || request.nextUrl.protocol === "https:";
  if (process.env.NODE_ENV === "production" && isHttps) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.headers.set("Content-Security-Policy", PRODUCTION_CSP);
  }
  return response;
}

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
  if (!isSameOriginMutation(request)) {
    return withRuntimeSecurityHeaders(
      request,
      NextResponse.json(
        { error: "CROSS_ORIGIN_REQUEST_REJECTED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }
  if (resolveRuntimeSiteAvailability() === "MAINTENANCE" && !isMaintenanceExempt(pathname)) {
    if (pathname.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
      return withRuntimeSecurityHeaders(
        request,
        NextResponse.json(
          { status: "maintenance" },
          { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
        ),
      );
    }
    return withRuntimeSecurityHeaders(
      request,
      NextResponse.redirect(new URL("/maintenance", request.url), 307),
    );
  }

  if (
    (pathname.startsWith("/mypage") || pathname.startsWith("/company/")) &&
    !request.cookies.has(SESSION_COOKIE_NAME)
  ) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return withRuntimeSecurityHeaders(request, NextResponse.redirect(loginUrl));
  }

  return withRuntimeSecurityHeaders(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
