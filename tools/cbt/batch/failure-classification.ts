/** Batch와 Gate 2 recovery가 공유하는 provider transient 분류. */
export const PROVIDER_TRANSIENT_CODES = new Set([
  "timeout",
  "provider_error",
  "rate_limited",
  "server_error",
]);

export function isProviderTransient(errorCode: string | null | undefined): boolean {
  return errorCode !== null && errorCode !== undefined && PROVIDER_TRANSIENT_CODES.has(errorCode);
}
