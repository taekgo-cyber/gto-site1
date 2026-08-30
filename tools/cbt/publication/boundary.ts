const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type PublicationEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "DATABASE_URL" | "NODE_ENV">
>;

export function assertLocalPublicationDatabaseBoundary(
  environment: PublicationEnvironment = process.env,
): void {
  if (environment.NODE_ENV === "production") {
    throw new Error("publication_production_node_env_forbidden");
  }
  const raw = environment.DATABASE_URL?.trim();
  if (!raw) throw new Error("publication_database_url_required");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("publication_database_url_invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("publication_database_url_invalid");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("publication_non_loopback_database_forbidden");
  }
}
