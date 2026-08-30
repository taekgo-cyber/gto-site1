const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const RELEASE_MUTATION_ACK = "I_ACKNOWLEDGE_BOUNDED_RELEASE_DB_MUTATION";

export type ReleaseExecutionEnvironment = "disposable" | "production";

export type ReleaseDatabaseIdentity = {
  environment: ReleaseExecutionEnvironment;
  expectedDatabaseHost: string;
  expectedDatabaseName: string;
};

export type ReleaseMutationApproval = {
  approvalId: string;
  acknowledgement: string;
};

function parseDatabaseUrl(): URL {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("RELEASE_DATABASE_URL_REQUIRED");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("RELEASE_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("RELEASE_DATABASE_URL_INVALID");
  }
  return parsed;
}

function normalizedDatabaseName(parsed: URL): string {
  const raw = parsed.pathname.replace(/^\//, "");
  if (!raw || raw.includes("/")) throw new Error("RELEASE_DATABASE_NAME_INVALID");
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new Error("RELEASE_DATABASE_NAME_INVALID");
  }
}

export function assertReleaseDatabaseIdentity(input: ReleaseDatabaseIdentity): {
  host: string;
  databaseName: string;
} {
  const parsed = parseDatabaseUrl();
  const host = parsed.hostname.toLowerCase();
  const databaseName = normalizedDatabaseName(parsed);
  const expectedHost = input.expectedDatabaseHost.trim().toLowerCase();
  const expectedName = input.expectedDatabaseName.trim();

  if (!expectedHost || !expectedName) throw new Error("RELEASE_TARGET_IDENTITY_REQUIRED");
  if (host !== expectedHost || databaseName !== expectedName) {
    throw new Error("RELEASE_TARGET_IDENTITY_MISMATCH");
  }

  const loopback = LOOPBACK_HOSTS.has(host);
  if (input.environment === "disposable") {
    if (!loopback) throw new Error("RELEASE_DISPOSABLE_DATABASE_NOT_LOOPBACK");
  } else if (input.environment === "production") {
    if (process.env.NODE_ENV !== "production") throw new Error("RELEASE_PRODUCTION_NODE_ENV_REQUIRED");
    if (loopback) throw new Error("RELEASE_PRODUCTION_DATABASE_LOOPBACK_FORBIDDEN");
  } else {
    throw new Error("RELEASE_ENVIRONMENT_INVALID");
  }

  return { host, databaseName };
}

export function assertReleaseMutationApproval(input: ReleaseMutationApproval): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/.test(input.approvalId.trim())) {
    throw new Error("RELEASE_APPROVAL_ID_INVALID");
  }
  if (input.acknowledgement !== RELEASE_MUTATION_ACK) {
    throw new Error("RELEASE_MUTATION_ACK_REQUIRED");
  }
}

export function assertReleaseEvidenceId(value: string, code: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{5,191}$/.test(normalized)) throw new Error(code);
  return normalized;
}

export function assertProductionCanonicalOrigin(input: {
  environment: ReleaseExecutionEnvironment;
  expectedCanonicalOrigin: string;
  targetBaseUrl: string;
}): string {
  let expected: URL;
  let target: URL;
  try {
    expected = new URL(input.expectedCanonicalOrigin);
    target = new URL(input.targetBaseUrl);
  } catch {
    throw new Error("RELEASE_CANONICAL_ORIGIN_INVALID");
  }

  for (const value of [expected, target]) {
    if (
      value.protocol !== "https:" ||
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      (value.pathname !== "/" && value.pathname !== "")
    ) {
      throw new Error("RELEASE_CANONICAL_ORIGIN_INVALID");
    }
  }

  if (expected.origin !== target.origin) throw new Error("RELEASE_CANONICAL_ORIGIN_MISMATCH");
  if (input.environment === "production") {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!configured) throw new Error("RELEASE_PRODUCTION_SITE_URL_REQUIRED");
    let configuredUrl: URL;
    try {
      configuredUrl = new URL(configured);
    } catch {
      throw new Error("RELEASE_PRODUCTION_SITE_URL_INVALID");
    }
    if (
      configuredUrl.protocol !== "https:" ||
      configuredUrl.username ||
      configuredUrl.password ||
      configuredUrl.search ||
      configuredUrl.hash ||
      configuredUrl.origin !== expected.origin ||
      configuredUrl.pathname !== "/"
    ) {
      throw new Error("RELEASE_PRODUCTION_SITE_URL_MISMATCH");
    }
  }
  return expected.origin;
}
