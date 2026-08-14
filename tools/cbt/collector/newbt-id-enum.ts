// STEP 10-3 — NEWBT 문제 ID 열거 모듈 (조사/실측 검증 완료).
// newbt.kr은 대량 id 목록을 한 번에 주는 공개 API가 없다. 대신 아래 연쇄를
// 이용해 직렬(시험지) 전체 문제 id를 열거한다:
//   GET  /question/serialAllList/{exam}   → 직렬 목록 [{serial, id, exam, ...}]
//   POST /question/firstQuestion/{qid}    → 그 문제가 속한 직렬의 1번 id
//   POST /question/nextQuestion/{qid}     → same 직렬의 다음 문제 id (끝에서 1번으로 순환)
// - 열거 종료 조건: nextQuestion이 이미 본 id를 반환하면(직렬 순환) 종료.
// - 직렬 1회 = 80문항. 화물운송종사는 2개 직렬(1967/1968) = 160문항.
// - POST는 body가 필요 없다 (jQuery ajax POST data={}와 동일, 실측 확인).
import { CBT_SOURCES, type CbtSourceDef } from "../sources.config";
import { RequestRateLimiter, DEFAULT_REQUEST_INTERVAL_MS } from "./fetch-source";

export const NEWBT_EXAM_NAME = "화물운송종사";
export const NEWBT_SERIAL_LOOP_GUARD = 500;

export type NewbtSerial = {
  serial: string;
  id: string;
  exam: string;
  alias?: string;
  date?: string;
  pass_rate?: string | null;
};

export type NewbtNavResult = {
  id: number;
  number: number;
};

export type EnumerateResult =
  | { kind: "ok"; serialId: string | null; ids: number[] }
  | { kind: "failed"; error: string };

function requireNewbtSource(source: CbtSourceDef): string {
  if (source.sourceName !== "NEWBT-HWMUL") {
    throw new Error(
      `ID 열거는 NEWBT-HWMUL 소스 전용입니다: ${source.sourceName}`,
    );
  }
  if (source.urlTemplate === null) {
    throw new Error(`urlTemplate 미확정: ${source.sourceName}`);
  }
  return new URL(source.urlTemplate).origin;
}

/** GET /question/serialAllList/{exam} — 공개, 로그인 불필요 */
export async function fetchNewbtSerials(
  source: CbtSourceDef,
  options: { limiter?: RequestRateLimiter; timeoutMs?: number } = {},
): Promise<{ kind: "ok"; serials: NewbtSerial[]; source: CbtSourceDef } | { kind: "failed"; error: string }> {
  const origin = requireNewbtSource(source);
  if (options.limiter) await options.limiter.throttle();
  const url = `${origin}/question/serialAllList/${encodeURIComponent(NEWBT_EXAM_NAME)}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "gto-cbt-collector/0.1" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
    });
    if (!response.ok) {
      return { kind: "failed", error: `HTTP ${response.status} (${url})` };
    }
    const json = (await response.json()) as {
      success?: boolean;
      data?: NewbtSerial[];
    };
    if (json.success !== true || !Array.isArray(json.data)) {
      return { kind: "failed", error: `serialAllList 응답 이상: ${JSON.stringify(json).slice(0, 120)}` };
    }
    return { kind: "ok", serials: json.data, source };
  } catch (error) {
    return {
      kind: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * POST /question/firstQuestion/{qid} — 해당 문제가 속한 직렬의 첫 문제.
 * POST /question/nextQuestion/{qid} — 같은 직렬의 다음 문제.
 */
async function navNewbt(
  origin: string,
  pathPart: "firstQuestion" | "nextQuestion",
  questionId: number,
  limiter: RequestRateLimiter | undefined,
  timeoutMs: number,
): Promise<NewbtNavResult | null> {
  if (limiter) await limiter.throttle();
  const url = `${origin}/question/${pathPart}/${questionId}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": "gto-cbt-collector/0.1" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const json = (await response.json()) as {
      success?: boolean;
      data?: { id?: number | string; number?: number | string };
    };
    const id = Number(json.data?.id);
    const number = Number(json.data?.number);
    if (
      json.success !== true ||
      !json.data ||
      !Number.isInteger(id) ||
      !Number.isInteger(number)
    ) {
      return null;
    }
    return { id, number };
  } catch {
    return null;
  }
}

/**
 * seed id 1개로 직렬 전체 문제 id를 순회해 수집한다.
 * - firstQuestion으로 직렬 1번을 찾고, nextQuestion으로 계속 이동한다.
 * - nextQuestion이 이미 본 id를 반환하면(직렬 순환 완료) 종료한다.
 * - NEWBT_SERIAL_LOOP_GUARD(500) 초과 시 비정상으로 판단해 실패 처리.
 */
export async function enumerateNewbtSerial(
  source: CbtSourceDef,
  seedQuestionId: number,
  options: { limiter?: RequestRateLimiter; timeoutMs?: number } = {},
): Promise<EnumerateResult> {
  const origin = requireNewbtSource(source);
  const limiter = options.limiter;
  const timeoutMs = options.timeoutMs ?? 15000;

  const first = await navNewbt(origin, "firstQuestion", seedQuestionId, limiter, timeoutMs);
  if (!first) {
    return { kind: "failed", error: `firstQuestion 실패 (seed ${seedQuestionId})` };
  }

  const ids: number[] = [];
  const seen = new Set<number>();
  let cursor = first.id;
  let steps = 0;

  while (!seen.has(cursor)) {
    if (steps >= NEWBT_SERIAL_LOOP_GUARD) {
      return {
        kind: "failed",
        error: `직렬 순회 가드 초과 (${NEWBT_SERIAL_LOOP_GUARD}), seed ${seedQuestionId}`,
      };
    }
    seen.add(cursor);
    ids.push(cursor);
    steps += 1;
    const next = await navNewbt(origin, "nextQuestion", cursor, limiter, timeoutMs);
    if (!next) {
      return {
        kind: "failed",
        error: `nextQuestion 실패 (id ${cursor}, 수집 ${ids.length}건 후)`,
      };
    }
    cursor = next.id;
  }

  return { kind: "ok", serialId: null, ids };
}

export function findNewbtSource(): CbtSourceDef {
  const source = CBT_SOURCES.find((s) => s.sourceName === "NEWBT-HWMUL");
  if (!source) throw new Error("NEWBT-HWMUL source 설정 없음");
  return source;
}

/** 재사용 가능한 rate limiter */
export function createEnumLimiter(
  intervalMs = DEFAULT_REQUEST_INTERVAL_MS,
): RequestRateLimiter {
  return new RequestRateLimiter(intervalMs);
}