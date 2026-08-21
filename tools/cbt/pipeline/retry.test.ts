import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithRetry,
  isRetryableStatus,
  RetryableError,
  withRetry,
} from "../pipeline/retry";

const noopSleep = vi.fn(async () => {});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isRetryableStatus", () => {
  it("429, 5xx는 retry 대상이다", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
  });

  it("그 외 HTTP 상태는 retry 대상이 아니다", () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe("withRetry", () => {
  it("일시 실패 후 성공하면 성공값을 반환한다", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new RetryableError("transient");
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 1000, sleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("지수 backoff로 대기한다 (base * 2^attempt)", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new RetryableError("transient");
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 100, sleep },
    );
    expect(delays).toEqual([100, 200]);
  });

  it("maxRetries를 초과하면 마지막 오류를 throw한다", async () => {
    const sleep = vi.fn(async () => {});
    const error = new RetryableError("always fails");
    await expect(
      withRetry(
        async () => {
          throw error;
        },
        { maxRetries: 2, baseDelayMs: 1000, sleep },
      ),
    ).rejects.toThrow("always fails");
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("RetryableError가 아니면 즉시 throw하고 재시도하지 않는다", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("hard failure");
        },
        { maxRetries: 3, baseDelayMs: 1000, sleep },
      ),
    ).rejects.toThrow("hard failure");
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("maxRetries=0이면 재시도 없이 1회만 시도한다", async () => {
    await expect(
      withRetry(
        async () => {
          throw new RetryableError("nope");
        },
        { maxRetries: 0, baseDelayMs: 1000, sleep: noopSleep },
      ),
    ).rejects.toThrow("nope");
    expect(noopSleep).not.toHaveBeenCalled();
  });

  it("computeDelay가 number를 반환하면 그 지연을 사용한다", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new RetryableError("transient");
        return "ok";
      },
      {
        maxRetries: 3,
        baseDelayMs: 100,
        sleep,
        computeDelay: () => 5000,
      },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(delays).toEqual([5000]);
  });

  it("computeDelay가 fail-fast를 반환하면 추가 시도 없이 종료한다 (sleep 0, attempt 1)", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const error = new RetryableError("always fails");
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw error;
        },
        {
          maxRetries: 3,
          baseDelayMs: 100,
          sleep,
          computeDelay: () => "fail-fast" as const,
        },
      ),
    ).rejects.toThrow("always fails");
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("computeDelay가 undefined면 기본 지수 backoff를 사용한다", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const error = new RetryableError("always fails");
    await expect(
      withRetry(
        async () => {
          throw error;
        },
        {
          maxRetries: 2,
          baseDelayMs: 100,
          sleep,
          computeDelay: () => undefined,
        },
      ),
    ).rejects.toThrow("always fails");
    expect(delays).toEqual([100, 200]);
  });

  it("computeDelay가 0을 반환하면 즉시 재시도한다 (sleep 0)", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new RetryableError("transient");
        return "ok";
      },
      {
        maxRetries: 3,
        baseDelayMs: 100,
        sleep,
        computeDelay: () => 0,
      },
    );
    expect(result).toBe("ok");
    expect(delays).toEqual([0]);
  });
});

describe("fetchWithRetry", () => {
  const fakeResponse = (status: number): Response =>
    new Response("body", { status });

  it("429 응답은 재시도 후 성공 응답을 반환한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fakeResponse(429))
      .mockResolvedValueOnce(fakeResponse(429))
      .mockResolvedValueOnce(fakeResponse(200));

    const response = await fetchWithRetry(
      "https://example.com/q/1",
      {},
      { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 5000, sleep: noopSleep },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("5xx 응답은 재시도한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fakeResponse(500))
      .mockResolvedValueOnce(fakeResponse(200));

    const response = await fetchWithRetry(
      "https://example.com/q/2",
      {},
      { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 5000, sleep: noopSleep },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("네트워크 오류(TypeError)는 재시도한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(fakeResponse(200));

    const response = await fetchWithRetry(
      "https://example.com/q/3",
      {},
      { maxRetries: 2, baseDelayMs: 1000, timeoutMs: 5000, sleep: noopSleep },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("timeout(TimeoutError)은 재시도한다", async () => {
    const timeoutError = new DOMException("The operation was aborted", "TimeoutError");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(fakeResponse(200));

    const response = await fetchWithRetry(
      "https://example.com/q/4",
      {},
      { maxRetries: 2, baseDelayMs: 1000, timeoutMs: 5000, sleep: noopSleep },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("재시도 소진 시 마지막 오류를 throw한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchWithRetry(
        "https://example.com/q/5",
        {},
        { maxRetries: 2, baseDelayMs: 1000, timeoutMs: 5000, sleep: noopSleep },
      ),
    ).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("429/5xx 외 HTTP 응답은 재시도하지 않고 그대로 반환한다", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse(404));

    const response = await fetchWithRetry(
      "https://example.com/q/6",
      {},
      { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 5000, sleep: noopSleep },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
