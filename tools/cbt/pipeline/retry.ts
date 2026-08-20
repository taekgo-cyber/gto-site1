// retry 규칙 (Session 10-1 PLAN §19).
// - retry 대상: network failure, timeout, rate limit(429), 5xx 등 transient 에러
// - 비재시도 대상(즉시 throw → 호출부가 REVIEW 처리): 그 외 HTTP 오류(4xx 등)
// 지수 backoff(baseDelay * 2^attempt)로 재시도하며, 마지막 시도 실패 시 throw한다.

/** 재시도 대상으로 판정되는 일시적 에러 */
export class RetryableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableError";
  }
}

/** rate limit(429) 및 서버 일시 오류(5xx) 여부 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export type RetryOptions = {
  /** 최대 재시도 횟수 (0이면 1회만 시도) */
  maxRetries: number;
  /** 첫 재시도 전 대기 간격(ms). 시도마다 2배로 증가 */
  baseDelayMs: number;
  /** 재시도 대기용 시계 주입 (테스트에서 시간 가속/단축) */
  sleep?: (ms: number) => Promise<void>;
};

export const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** fn이 RetryableError만 재시도하고, 그 외 오류는 즉시 throw한다. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries);
  const sleep = options.sleep ?? defaultSleep;
  const baseDelayMs = Math.max(0, options.baseDelayMs);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!(error instanceof RetryableError)) throw error;
      if (attempt >= maxRetries) break;
      const delayMs = baseDelayMs * 2 ** attempt;
      await sleep(delayMs);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// fetch 전용 편의 래퍼 — collector에서 재사용한다.
// ---------------------------------------------------------------------------

export type FetchRetryOptions = RetryOptions & {
  timeoutMs: number;
};

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * URL을 fetch하고 일시적 실패(timeout/network/429/5xx)를 재시도한다.
 * - 네트워크 오류(TypeError) / timeout(TimeoutError) → RetryableError로 재시도
 * - 429, 5xx → RetryableError로 재시도
 * - 그 외 HTTP 상태 → Response를 그대로 반환 (호출부가 판단)
 * - 재시도 소진 시 마지막 오류를 throw
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: FetchRetryOptions,
): Promise<Response> {
  const maxRetries = Math.max(0, options.maxRetries);
  const sleep = options.sleep ?? defaultSleep;
  const baseDelayMs = Math.max(0, options.baseDelayMs);
  const timeoutMs = Math.max(0, options.timeoutMs);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init ?? {}, timeoutMs);
      if (isRetryableStatus(response.status)) {
        throw new RetryableError(
          `HTTP ${response.status} (${input instanceof Request ? input.url : String(input)})`,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof RetryableError) {
        lastError = error;
        if (attempt >= maxRetries) break;
        const delayMs = baseDelayMs * 2 ** attempt;
        await sleep(delayMs);
        continue;
      }
      // 네트워크 오류(TypeError) 또는 AbortSignal.timeout(TimeoutError)
      lastError = error;
      if (attempt >= maxRetries) break;
      const delayMs = baseDelayMs * 2 ** attempt;
      await sleep(delayMs);
    }
  }

  throw lastError;
}
