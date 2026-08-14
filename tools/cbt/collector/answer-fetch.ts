// STEP 10-2 — NEWBT 정답 수집 (examples API 백필 전용, 조사/검증 완료).
// newbt.kr은 문제 HTML에 정답을 포함하지 않고, 별도 공개 API로 제공한다:
//   GET /question/examples/{qid} → { success, data: [{ number, contents, is_answer, ... }] }
//   is_answer === "1" 인 보기 번호가 정답이다.
// 이 모듈은 기존 STEP 1~10 extractor/ingest를 수정하지 않고, candidate에
// 정답을 백필하는 전용 경로로만 동작한다. (기존 파이프라인 원칙: 추측 금지,
// 수집된 원천 데이터의 표기를 그대로 사용)
import { CBT_SOURCES, type CbtSourceDef } from "../sources.config";
import { RequestRateLimiter, DEFAULT_REQUEST_INTERVAL_MS } from "./fetch-source";

export type NewbtExampleRow = {
  question: string;
  version: string;
  number: string;
  contents: string;
  image: string;
  /** "1" = 정답, "0" = 오답 */
  is_answer: string;
  hit: string;
};

export type FetchAnswersResult =
  | { kind: "found"; answers: number[] }
  | { kind: "empty"; reason: string }
  | { kind: "failed"; error: string };

/** NEWBT 소스인지 판단하는 파라미터 가드 */
function requireNewbtSource(source: CbtSourceDef): string {
  if (source.sourceName !== "NEWBT-HWMUL") {
    throw new Error(
      `정답 백필은 NEWBT-HWMUL 소스 전용입니다: ${source.sourceName}`,
    );
  }
  // urlTemplate: "https://newbt.kr/문제/{id}" → origin 추출
  if (source.urlTemplate === null) {
    throw new Error(`urlTemplate 미확정: ${source.sourceName}`);
  }
  const origin = new URL(source.urlTemplate).origin;
  return origin;
}

/**
 * NEWBT 문제 1건의 정답 보기 번호 목록을 examples API로 조회한다.
 * - is_answer === "1" 인 보기의 number를 answers로 반환한다.
 * - data가 비어 있으면 empty ("answer API 응답 없음").
 * - HTTP/네트워크 실패는 failed (batch 중단 금지, No Drop 원칙).
 */
export async function fetchAnswersForNewbtId(
  source: CbtSourceDef,
  sourceQuestionId: string,
  options: { limiter?: RequestRateLimiter; timeoutMs?: number } = {},
): Promise<FetchAnswersResult> {
  const origin = requireNewbtSource(source);
  if (options.limiter) await options.limiter.throttle();

  const url = `${origin}/question/examples/${encodeURIComponent(sourceQuestionId)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 15000,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "gto-cbt-collector/0.1" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return {
        kind: "failed",
        error: `HTTP ${response.status} (${url})`,
      };
    }

    const json = (await response.json()) as {
      success?: boolean;
      data?: NewbtExampleRow[];
    };
    if (json.success !== true || !Array.isArray(json.data)) {
      return {
        kind: "empty",
        reason: JSON.stringify(json).slice(0, 120),
      };
    }

    const answers = json.data
      .filter((row) => row.is_answer === "1")
      .map((row) => Number.parseInt(row.number, 10))
      .filter((n) => Number.isInteger(n) && n >= 1);

    if (answers.length === 0) {
      return { kind: "empty", reason: "is_answer==1 보기가 없음" };
    }
    return { kind: "found", answers: [...new Set(answers)] };
  } catch (error) {
    return {
      kind: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** NEWBT 소스 정의 조회 (미존재 시 throw) */
export function findNewbtSource(): CbtSourceDef {
  const source = CBT_SOURCES.find((s) => s.sourceName === "NEWBT-HWMUL");
  if (!source) throw new Error("NEWBT-HWMUL source 설정 없음");
  return source;
}

/** 재사용 가능한 rate limiter (기존 DEFAULT_REQUEST_INTERVAL_MS 재사용) */
export function createAnswerLimiter(
  intervalMs = DEFAULT_REQUEST_INTERVAL_MS,
): RequestRateLimiter {
  return new RequestRateLimiter(intervalMs);
}