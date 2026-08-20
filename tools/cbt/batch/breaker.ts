// Phase 0 F — circuit breaker (fail-closed).
// 일정 횟수의 연속 실패가 쌓이면 breaker가 open되어 이후 항목의 LLM 호출을
// 단락(circuit_open)시킨다. 재시도(500ms 등 백오프)와 달리, 상태가 좋지 않은
// 동안 비용 낭비 없이 빠르게 막는다.
// - closed → 연속 실패가 failureThreshold 도달 시 open
// - open → resetTimeoutMs 경과 후 half_open (단일 probe 허용)
// - half_open → 성공 시 closed 복귀, 실패 시 open 재진입(쿨다운 리셋)
export type BreakerState = "closed" | "open" | "half_open";

export type CircuitBreakerOptions = {
  /** open 되기 전 연속 실패 한계 (기본 5) */
  failureThreshold: number;
  /** open 유지 최소 시간 ms (기본 60_000) */
  resetTimeoutMs: number;
  /** 시간 주입 (테스트 전용) */
  now?: () => number;
};

export type BreakerStatus = {
  state: BreakerState;
  consecutiveFailures: number;
  failuresOpenedAt: number | null;
};

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly now: () => number;

  private state: BreakerState = "closed";
  private consecutiveFailures = 0;
  private failuresOpenedAt: number | null = null;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = Math.max(1, options.failureThreshold);
    this.resetTimeoutMs = Math.max(0, options.resetTimeoutMs);
    this.now = options.now ?? Date.now;
  }

  /** 현재 상태 (모니터링/로깅용) */
  status(): BreakerStatus {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failuresOpenedAt: this.failuresOpenedAt,
    };
  }

  /**
   * 항목 처리를 시도할 수 있는지 여부.
   * open 상태에서 쿨다운이 지났으면 half_open으로 전환해 단일 probe를 허용한다.
   * half_open에서 다시 부르면 probe가 이미 예약된 것이므로 false를 반환한다 (단일 probe 보장).
   */
  allowed(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (this.now() - (this.failuresOpenedAt ?? 0) >= this.resetTimeoutMs) {
        this.state = "half_open";
        return true; // 첫 호출만 probe 허용
      }
      return false;
    }
    // half_open: probe 예약됨 → 추가 allowed는 거부
    return false;
  }

  /**
   * half_open 프로브 예약을 취소한다. half_open이면 open으로 되돌리고 기존
   * failuresOpenedAt을 유지해 쿨다운을 이어간다. closed/open이면 no-op.
   * dual breaker에서 한쪽만 허용됐을 때 abort한 쪽의 프로브를 놓치지 않도록 사용한다.
   */
  cancelProbe(): void {
    if (this.state === "half_open") this.state = "open";
  }

  /** 시도 성공 시 호출. half_open → closed / closed → 카운터 리셋 */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === "half_open") this.state = "closed";
    this.failuresOpenedAt = null;
  }

  /** 시도 실패 시 호출. 연속 실패 누적 → threshold 도달 시 open */
  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.failuresOpenedAt = this.now();
      this.state = "open";
    }
  }

  /** 명시적 초기화 (운영자가 복구 확인 후 호출) */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.failuresOpenedAt = null;
  }
}