const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type BoundaryEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "DATABASE_URL"
    | "NODE_ENV"
    | "CBT_HANDOFF_PROJECT"
    | "CBT_HANDOFF_ENVIRONMENT"
    | "CBT_HANDOFF_SERVICE"
    | "CBT_HANDOFF_PRODUCTION_EMPTY"
    | "CBT_HANDOFF_TUNNEL_PORT"
  >
>;

function databaseUrl(environment: BoundaryEnvironment): URL {
  const raw = environment.DATABASE_URL?.trim();
  if (!raw) throw new Error("cbt_source_database_url_required");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("cbt_source_database_url_invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("cbt_source_database_url_invalid");
  }
  return parsed;
}

export function assertLocalSourceDatabaseBoundary(
  environment: BoundaryEnvironment = process.env,
): URL {
  if (environment.NODE_ENV === "production") throw new Error("cbt_source_production_node_env_forbidden");
  const parsed = databaseUrl(environment);
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("cbt_source_local_database_must_be_loopback");
  }
  return parsed;
}

export function assertStagingTargetBoundary(
  environment: BoundaryEnvironment = process.env,
): {
  project: string;
  environment: "staging";
  service: string;
  tunnelPort: string;
} {
  if (environment.NODE_ENV === "production") throw new Error("cbt_source_production_node_env_forbidden");
  if (environment.CBT_HANDOFF_PROJECT !== "gto-site1-production") {
    throw new Error("cbt_source_target_project_invalid");
  }
  if (environment.CBT_HANDOFF_ENVIRONMENT !== "staging") {
    throw new Error("cbt_source_production_target_forbidden");
  }
  if (environment.CBT_HANDOFF_SERVICE !== "gto-web") {
    throw new Error("cbt_source_target_service_invalid");
  }
  if (environment.CBT_HANDOFF_PRODUCTION_EMPTY !== "true") {
    throw new Error("cbt_source_production_empty_not_confirmed");
  }
  const parsed = databaseUrl(environment);
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("cbt_source_staging_database_must_use_local_tunnel");
  }
  const tunnelPort = environment.CBT_HANDOFF_TUNNEL_PORT ?? "55432";
  if (parsed.port !== tunnelPort) throw new Error("cbt_source_staging_tunnel_port_invalid");
  return {
    project: environment.CBT_HANDOFF_PROJECT,
    environment: "staging",
    service: environment.CBT_HANDOFF_SERVICE,
    tunnelPort,
  };
}
