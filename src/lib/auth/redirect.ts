export const DEFAULT_AUTH_REDIRECT = "/mypage";

const AUTH_ROUTES = new Set(["/login", "/signup"]);
const LOCAL_ORIGIN = "https://local.invalid";

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
