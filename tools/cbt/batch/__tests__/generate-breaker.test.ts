// Phase 0 F — classifyGenerationOutcome 순수 단위 테스트.
// runBatchGenerate 통합 없이 CircuitBreaker를 직접 주입해 분류 규칙을 고정한다.
// - transient 4종(timeout/provider_error/rate_limited/server_error) → providerBreaker 실패
// - QA_FAILED/errorCode null → semanticBreaker 실패 + providerBreaker reset
// - QA_PASSED/errorCode null → 두 breaker 카운터 reset
// - terminal 5종(http_client_error/schema_validation_failed/malformed_json/
//   empty_response/content_invalid) → 양쪽 neutral (계수·리셋 없음)
// - 기본 임계값 의미 고정: provider 5회 / semantic 10회 open
import { describe, expect, it } from "vitest";
import { classifyGenerationOutcome } from "../generate";
import { CircuitBreaker } from "../breaker";

const TRANSIENT_CODES = ["timeout", "provider_error", "rate_limited", "server_error"];
const TERMINAL_CODES = [
  "http_client_error",
  "schema_validation_failed",
  "malformed_json",
  "empty_response",
  "content_invalid",
];

function freshPair(): { p: CircuitBreaker; s: CircuitBreaker } {
  return {
    p: new CircuitBreaker({ failureThreshold: 100, resetTimeoutMs: 60_000 }),
    s: new CircuitBreaker({ failureThreshold: 100, resetTimeoutMs: 60_000 }),
  };
}

describe("classifyGenerationOutcome", () => {
  it.each(TRANSIENT_CODES)("transient %s → providerBreaker 실패 +1", (code) => {
    const { p, s } = freshPair();
    classifyGenerationOutcome("FAILED", code, p, s);
    expect(p.status().consecutiveFailures).toBe(1);
    expect(s.status().consecutiveFailures).toBe(0);
  });

  it("QA_FAILED/errorCode null → semanticBreaker 실패 +1, providerBreaker reset", () => {
    const { p, s } = freshPair();
    p.recordFailure(); // 이전 transient 1회 선행
    classifyGenerationOutcome("QA_FAILED", null, p, s);
    expect(p.status().consecutiveFailures).toBe(0); // 정상 응답 → reset
    expect(s.status().consecutiveFailures).toBe(1);
  });

  it("QA_PASSED/errorCode null → 양쪽 카운터 reset", () => {
    const { p, s } = freshPair();
    p.recordFailure();
    s.recordFailure();
    classifyGenerationOutcome("QA_PASSED", null, p, s);
    expect(p.status().consecutiveFailures).toBe(0);
    expect(s.status().consecutiveFailures).toBe(0);
    expect(p.status().state).toBe("closed");
    expect(s.status().state).toBe("closed");
  });

  it.each(TERMINAL_CODES)("terminal %s → 양쪽 neutral", (code) => {
    const { p, s } = freshPair();
    classifyGenerationOutcome("FAILED", code, p, s);
    expect(p.status().consecutiveFailures).toBe(0);
    expect(s.status().consecutiveFailures).toBe(0);
    expect(p.status().state).toBe("closed");
    expect(s.status().state).toBe("closed");
  });

  it("terminal 분류는 half_open 예약을 해제해 고착을 막는다", () => {
    const p = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    const s = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    p.recordFailure(); // open
    s.recordFailure(); // open
    expect(p.allowed()).toBe(true); // half_open probe 예약
    expect(s.allowed()).toBe(true); // half_open probe 예약
    expect(p.status().state).toBe("half_open");
    expect(s.status().state).toBe("half_open");

    // terminal은 계수 없이 양쪽 half_open 예약을 해제한다
    classifyGenerationOutcome("FAILED", "http_client_error", p, s);
    expect(p.status().state).toBe("open");
    expect(s.status().state).toBe("open");
  });

  it("transient 분류 시 provider는 open 유지, semantic half_open 예약도 해제", () => {
    const p = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    const s = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    p.recordFailure(); // open
    s.recordFailure(); // open
    expect(p.allowed()).toBe(true); // half_open probe 예약
    expect(s.allowed()).toBe(true); // half_open probe 예약

    // transient는 provider에 +1(count 남은 half_open) → 다시 open, semantic은 cancelProbe
    classifyGenerationOutcome("FAILED", "timeout", p, s);
    expect(p.status().state).toBe("open");
    expect(s.status().state).toBe("open");
  });

  it("provider 임계값 5: 정확히 5회 transient 실패 시 open", () => {
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 100,
      resetTimeoutMs: 60_000,
    });
    for (let i = 0; i < 4; i += 1) {
      classifyGenerationOutcome("FAILED", "timeout", providerBreaker, semanticBreaker);
      expect(providerBreaker.status().state).toBe("closed");
    }
    classifyGenerationOutcome("FAILED", "timeout", providerBreaker, semanticBreaker);
    expect(providerBreaker.status().consecutiveFailures).toBe(5);
    expect(providerBreaker.status().state).toBe("open");
    expect(providerBreaker.allowed()).toBe(false);
    expect(semanticBreaker.status().consecutiveFailures).toBe(0);
  });

  it("semantic 임계값 10: 정확히 10회 QA_FAILED/null 시 open", () => {
    const providerBreaker = new CircuitBreaker({
      failureThreshold: 100,
      resetTimeoutMs: 60_000,
    });
    const semanticBreaker = new CircuitBreaker({
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
    });
    for (let i = 0; i < 9; i += 1) {
      classifyGenerationOutcome("QA_FAILED", null, providerBreaker, semanticBreaker);
      expect(semanticBreaker.status().state).toBe("closed");
    }
    classifyGenerationOutcome("QA_FAILED", null, providerBreaker, semanticBreaker);
    expect(semanticBreaker.status().consecutiveFailures).toBe(10);
    expect(semanticBreaker.status().state).toBe("open");
    expect(semanticBreaker.allowed()).toBe(false);
    // provider는 QA_FAILED 정상 응답으로 계속 reset → 0 유지
    expect(providerBreaker.status().consecutiveFailures).toBe(0);
    expect(providerBreaker.status().state).toBe("closed");
  });
});