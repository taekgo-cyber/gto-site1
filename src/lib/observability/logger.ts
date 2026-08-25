export type OperationalActorType = "ANONYMOUS" | "USER" | "COMPANY" | "ADMIN" | "SYSTEM";

export type OperationalErrorCategory =
  | "AUTH"
  | "DATABASE"
  | "PROVIDER"
  | "VALIDATION"
  | "POLICY"
  | "UNEXPECTED";

const IDENTIFIER_KEYS = new Set([
  "requestId",
  "userId",
  "companyId",
  "leadId",
  "campaignId",
  "ticketId",
  "eventId",
  "jobId",
  "route",
]);

function boundedToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 120);
  return normalized && /^[A-Za-z0-9_:/.-]+$/.test(normalized) ? normalized : undefined;
}

function stableErrorCode(error: unknown): string | undefined {
  const code = boundedToken((error as { code?: unknown })?.code);
  return code?.slice(0, 60);
}

export function createOperationalErrorEvent(input: {
  operation: string;
  actorType: OperationalActorType;
  category: OperationalErrorCategory;
  error: unknown;
  identifiers?: Record<string, unknown>;
  now?: Date;
}) {
  const identifiers = Object.fromEntries(
    Object.entries(input.identifiers ?? {}).flatMap(([key, value]) => {
      if (!IDENTIFIER_KEYS.has(key)) return [];
      const token = boundedToken(value);
      return token ? [[key, token]] : [];
    }),
  );
  const now = input.now ?? new Date();
  return {
    event: "operational_error" as const,
    operation: boundedToken(input.operation) ?? "unknown_operation",
    timestamp: Number.isNaN(now.getTime()) ? new Date(0).toISOString() : now.toISOString(),
    actorType: input.actorType,
    category: input.category,
    errorName: errorName(input.error),
    ...(stableErrorCode(input.error) ? { errorCode: stableErrorCode(input.error) } : {}),
    ...(Object.keys(identifiers).length > 0 ? { identifiers } : {}),
  };
}

function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return boundedToken(name)?.slice(0, 60) ?? "UnknownError";
}

export function logOperationalError(input: Parameters<typeof createOperationalErrorEvent>[0]): void {
  console.error(JSON.stringify(createOperationalErrorEvent(input)));
}
