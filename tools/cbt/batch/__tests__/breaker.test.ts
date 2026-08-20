// Phase 0 F — circuit breaker (fail-closed) 테스트.
import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../breaker";

describe("CircuitBreaker", () => {
  it("closed 상태에서는 항상 허용된다", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
    expect(breaker.allowed()).toBe(true);
    expect(breaker.status().state).toBe("closed");
  });

  it("연속 실패가 threshold 도달 → open, 이후 allowed=false", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    expect(breaker.allowed()).toBe(true); // 1 < 2
    breaker.recordFailure();
    expect(breaker.status().state).toBe("open");
    expect(breaker.allowed()).toBe(false);
  });

  it("open — 쿨다운 경과 시 half_open으로 단일 probe 허용", () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });
    breaker.recordFailure(); // open (failuresOpenedAt = 0)
    expect(breaker.allowed()).toBe(false);

    now = 500; // 쿨다운 전
    expect(breaker.allowed()).toBe(false);

    now = 1000; // 쿨다운 경과
    expect(breaker.allowed()).toBe(true); // 단일 probe 허용 (half_open 전환)
    expect(breaker.status().state).toBe("half_open");
    // probe가 이미 예약된 상태(half_open)에서의 추가 allowed는 거부 (단일 probe 보장)
    expect(breaker.allowed()).toBe(false);
  });

  it("cancelProbe() → half_open→open, openedAt 유지, 이후 allowed()로 probe 재예약", () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });
    breaker.recordFailure(); // open (failuresOpenedAt = 0)
    const openedAt = breaker.status().failuresOpenedAt;

    now = 1000; // 쿨다운 경과
    expect(breaker.allowed()).toBe(true); // probe 예약 (half_open)
    expect(breaker.status().state).toBe("half_open");

    breaker.cancelProbe(); // abort → open 복귀
    expect(breaker.status().state).toBe("open");
    expect(breaker.status().failuresOpenedAt).toBe(openedAt); // openedAt 유지 (쿨다운 이어짐)

    // openedAt이 유지된 상태에서 다시 allowed()로 probe 예약 가능
    now = 2000;
    expect(breaker.allowed()).toBe(true);
    expect(breaker.status().state).toBe("half_open");
  });

  it("half_open에서 성공 → closed 복귀", () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });
    breaker.recordFailure();
    now = 1000;
    expect(breaker.allowed()).toBe(true); // half_open probe
    breaker.recordSuccess();
    expect(breaker.status().state).toBe("closed");
    expect(breaker.status().consecutiveFailures).toBe(0);
  });

  it("half_open에서 실패 → 다시 open (쿨다운 리셋)", () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });
    breaker.recordFailure();
    now = 1000;
    expect(breaker.allowed()).toBe(true);
    breaker.recordFailure(); // probe 실패
    expect(breaker.status().state).toBe("open");
    const openedAt = breaker.status().failuresOpenedAt;
    expect(openedAt).toBe(1000); // 리셋되어 새로 open된 시각
  });

  it("closed에서 성공 시 카운터 리셋", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    expect(breaker.status().consecutiveFailures).toBe(0);
    expect(breaker.status().state).toBe("closed");
  });

  it("reset() → closed 초기화", () => {
    const now = 1000;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });
    breaker.recordFailure();
    expect(breaker.status().state).toBe("open");
    breaker.reset();
    expect(breaker.status().state).toBe("closed");
    expect(breaker.allowed()).toBe(true);
  });
});