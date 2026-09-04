export const DEFAULT_AUTH_REDIRECT = "/mypage";

const AUTH_ROUTES = new Set(["/login", "/signup"]);
const LOCAL_ORIGIN = "https://local.invalid";

export type AuthReturnSearchParams = Record<string, string | string[] | undefined>;

/**
 * Build a safe `next` destination from a pathname plus an allow-list of
 * documented query keys. Only single string values are echoed; arrays,
 * empty values, and undocumented keys (e.g. transient banners like
 * `message`/`error`, one-time tokens) are dropped. The result is always
 * re-validated through {@link normalizeAuthRedirect} before redirect.
 */
export function buildSafeReturnTo(
  pathname: string,
  searchParams?: AuthReturnSearchParams,
  allowedKeys: readonly string[] = [],
): string {
  if (!searchParams || allowedKeys.length === 0) return pathname;
  const params = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = searchParams[key];
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Build the login URL preserving a post-login destination.
 * `returnTo` is sanitized by {@link normalizeAuthRedirect} first, so raw
 * user input must never be interpolated into `/login?next=` directly.
 */
export function buildLoginUrl(returnTo?: string): string {
  return `/login?next=${encodeURIComponent(normalizeAuthRedirect(returnTo))}`;
}

export function normalizeAuthRedirect(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AUTH_REDIRECT;

  const candidate = value.trim();
  if (!candidate || candidate.length > 2_048 || !candidate.startsWith("/")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  try {
    const parsed = new URL(candidate, LOCAL_ORIGIN);
    if (
      parsed.origin !== LOCAL_ORIGIN ||
      candidate.includes("\\") ||
      AUTH_ROUTES.has(parsed.pathname)
    ) {
      return DEFAULT_AUTH_REDIRECT;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}
