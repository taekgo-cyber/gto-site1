const DEVELOPMENT_SITE_URL = "http://localhost:3000";
const BUILD_FALLBACK_SITE_URL = "https://example.invalid";

export function getSiteUrl(
  env: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "NEXT_PUBLIC_SITE_URL">> = process.env,
): string {
  const production = env.NODE_ENV === "production";
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (production ? BUILD_FALLBACK_SITE_URL : DEVELOPMENT_SITE_URL);

  try {
    const url = new URL(raw);
    if (
      (production && url.protocol !== "https:") ||
      (!production && !["http:", "https:"].includes(url.protocol)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("SITE_URL_INVALID");
    }
    return url.origin;
  } catch {
    throw new Error("SITE_URL_INVALID");
  }
}
