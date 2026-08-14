// Collector (Session 10-1 PLAN §7).
// 웹 원자료를 수집해 data/cbt/raw/{sourceName}/{sourceQuestionId}.html로 보존한다.
// - STEP 2의 fetchWithRetry 재사용 (timeout/429/5xx 지수 backoff)
// - contentHash(sha256) 계산, 동일 내용이면 재수집 skip
// - 요청 간 최소 간격(기본 500ms), 연속 5회 실패 시 source 중단
// - 원문 HTML은 수정/정제 없이 그대로 저장
// robots.txt 우회/로그인·캡차 우회 등은 일절 구현하지 않는다.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CBT_LLM_MAX_RETRIES,
  CBT_RAW_DIR,
  CBT_RETRY_BASE_DELAY_MS,
} from "../config";
import { fetchWithRetry } from "../pipeline/retry";
import type { CbtSourceDef } from "../sources.config";
import { URL_PLACEHOLDER } from "../sources.config";
import type { SourceRef } from "../types";

export const DEFAULT_USER_AGENT =
  "gto-cbt-collector/0.1 (web research; local only)";

/** 요청 간 최소 간격(ms) — 기본 500ms */
export const DEFAULT_REQUEST_INTERVAL_MS = 500;

/** 개별 fetch 타임아웃(ms) — 기본 15초 */
export const DEFAULT_COLLECT_TIMEOUT_MS = 15000;

/** 동일 source에서 연속 실패 허용 횟수 */
export const MAX_CONSECUTIVE_FAILURES = 5;

export type CollectSourceResult =
  | { kind: "collected"; source: SourceRef; bytes: number }
  | { kind: "skipped"; source: SourceRef }
  | { kind: "failed"; sourceQuestionId: string; error: unknown };

export type CollectSourceBatchResult = {
  results: CollectSourceResult[];
  consecutiveFailures: number;
  /** 연속 실패 MAX_CONSECUTIVE_FAILURES 도달로 중단되었는지 */
  stopped: boolean;
};

export type CollectSourceOptions = {
  /** true면 기존 파일이 있어도 재수집 */
  force?: boolean;
  /** raw 저장 루트 디렉터리 (기본: config.CBT_RAW_DIR) */
  rawDir?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  /** 요청 간 최소 간격(ms). 0이면 간격 없음 */
  requestIntervalMs?: number;
};

/** urlTemplate의 {id}를 sourceQuestionId로 치환한다 */
export function buildQuestionUrl(
  source: CbtSourceDef,
  sourceQuestionId: string,
): string | null {
  if (source.urlTemplate === null) return null;
  return source.urlTemplate.replaceAll(URL_PLACEHOLDER, sourceQuestionId);
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** 기존 파일이 있으면 그 hash, 없으면 null */
async function existingFileHash(targetFile: string): Promise<string | null> {
  try {
    return sha256Hex(await fs.readFile(targetFile));
  } catch {
    return null;
  }
}

function makeSourceRef(
  source: CbtSourceDef,
  sourceQuestionId: string,
  sourceUrl: string,
  contentHash: string,
): SourceRef {
  return {
    sourceName: source.sourceName,
    sourceQuestionId,
    originalUrl: sourceUrl,
    fetchedAt: new Date().toISOString(),
    rawSourceFile: `${source.sourceName}/${sourceQuestionId}.html`,
    rawBlockId: "", // extractor가 문제 Block 분할 시 채운다
    contentHash,
  };
}

/** 요청 간 최소 간격을 보장하는 rate limiter */
export class RequestRateLimiter {
  private lastRequestAt = 0;

  constructor(private readonly intervalMs: number) {}

  async throttle(): Promise<void> {
    if (this.intervalMs <= 0) return;
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (this.lastRequestAt !== 0 && elapsed < this.intervalMs) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.intervalMs - elapsed),
      );
    }
    this.lastRequestAt = Date.now();
  }
}

/**
 * 문제 1건 수집. 실패해도 throw하지 않고 CollectSourceResult로 반환한다.
 * (개별 실패가 전체 batch를 중단시키지 않도록 — batch는 결과를 보고 판단)
 */
export async function collectSourceId(
  source: CbtSourceDef,
  sourceQuestionId: string,
  options: CollectSourceOptions = {},
  limiter?: RequestRateLimiter,
): Promise<CollectSourceResult> {
  if (limiter) await limiter.throttle();

  const sourceUrl = buildQuestionUrl(source, sourceQuestionId);
  if (sourceUrl === null) {
    return {
      kind: "failed",
      sourceQuestionId,
      error: new Error(
        `수집 불가: source=${source.sourceName} urlTemplate 미확정 (status=${source.status})`,
      ),
    };
  }

  const rawDir = options.rawDir ?? CBT_RAW_DIR;
  const sourceDir = path.join(rawDir, source.sourceName);
  const targetFile = path.join(sourceDir, `${sourceQuestionId}.html`);

  // 재수집 skip: force가 아니고 기존 파일이 있으면 fetch 없이 skip.
  // skip 시 반환되는 contentHash는 기존 파일의 sha256 (동일 내용 보존 확인용)
  if (!options.force) {
    const existingHash = await existingFileHash(targetFile);
    if (existingHash !== null) {
      return {
        kind: "skipped",
        source: makeSourceRef(source, sourceQuestionId, sourceUrl, existingHash),
      };
    }
  }

  try {
    const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    const response = await fetchWithRetry(
      sourceUrl,
      { headers: { "User-Agent": userAgent } },
      {
        maxRetries: options.maxRetries ?? CBT_LLM_MAX_RETRIES,
        baseDelayMs: options.retryBaseDelayMs ?? CBT_RETRY_BASE_DELAY_MS,
        timeoutMs: options.timeoutMs ?? DEFAULT_COLLECT_TIMEOUT_MS,
      },
    );

    if (!response.ok) {
      return {
        kind: "failed",
        sourceQuestionId,
        error: new Error(`HTTP ${response.status} (${sourceUrl})`),
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentHash = sha256Hex(buffer);

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(targetFile, buffer);

    return {
      kind: "collected",
      source: makeSourceRef(source, sourceQuestionId, sourceUrl, contentHash),
      bytes: buffer.length,
    };
  } catch (error) {
    return { kind: "failed", sourceQuestionId, error };
  }
}

/**
 * 소스 전체(id 목록)를 순차 수집한다.
 * 연속 실패가 MAX_CONSECUTIVE_FAILURES(5)에 도달하면 해당 source를 중단한다.
 */
export async function collectSourceBatch(
  source: CbtSourceDef,
  questionIds: readonly string[],
  options: CollectSourceOptions = {},
): Promise<CollectSourceBatchResult> {
  const limiter = new RequestRateLimiter(
    options.requestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS,
  );

  const results: CollectSourceResult[] = [];
  let consecutiveFailures = 0;

  for (const sourceQuestionId of questionIds) {
    const result = await collectSourceId(source, sourceQuestionId, options, limiter);
    results.push(result);

    if (result.kind === "failed") {
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return { results, consecutiveFailures, stopped: true };
      }
    } else {
      consecutiveFailures = 0;
    }
  }

  return { results, consecutiveFailures, stopped: false };
}
