// CBT 파이프라인 설정 (Session 10-1 PLAN §10/§15).
// 환경변수 로드 + 기본값 + 경로 상수를 export한다.
// 후속 STEP(collector/extractor/llm/dedupe/cli)에서 그대로 재사용한다.
import "dotenv/config";
import path from "node:path";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// 데이터 디렉터리 (data/cbt 전체는 .gitignore 대상)
// ---------------------------------------------------------------------------

export const CBT_DATA_DIR = process.env.CBT_DATA_DIR ?? "data/cbt";

export const CBT_RAW_DIR = path.join(CBT_DATA_DIR, "raw");
export const CBT_RAW_ASSETS_DIR = path.join(CBT_RAW_DIR, "assets");
export const CBT_CACHE_DIR = path.join(CBT_DATA_DIR, "cache");
export const CBT_LLM_CACHE_DIR = path.join(CBT_CACHE_DIR, "llm");
export const CBT_CANDIDATE_DIR = path.join(CBT_DATA_DIR, "candidate");
/** STEP 6 — rawHtmlSnippet 보관 디렉터리 (content-addressable) */
export const CBT_SNIPPETS_DIR = path.join(CBT_DATA_DIR, "snippets");

/** STEP 9 — batch runner durable run log 디렉터리 (runId별 JSONL) */
export const CBT_BATCH_RUNS_DIR = path.join(CBT_DATA_DIR, "runs");

export const CANDIDATE_FILES = {
  parsed: path.join(CBT_CANDIDATE_DIR, "parsed.ndjson"),
  review: path.join(CBT_CANDIDATE_DIR, "review.ndjson"),
  rejected: path.join(CBT_CANDIDATE_DIR, "rejected.ndjson"),
  manifest: path.join(CBT_CANDIDATE_DIR, "manifest.json"),
} as const;

// ---------------------------------------------------------------------------
// LLM 설정
// ---------------------------------------------------------------------------

/** deepseek | kimi | openai — 모두 OpenAI-compatible chat completions 사용 */
export const CBT_LLM_PROVIDER = process.env.CBT_LLM_PROVIDER ?? "deepseek";

export const CBT_LLM_BASE_URL =
  process.env.CBT_LLM_BASE_URL ?? "https://api.deepseek.com/v1";

export const CBT_LLM_API_KEY = process.env.CBT_LLM_API_KEY ?? "";

export const CBT_LLM_MODEL = process.env.CBT_LLM_MODEL ?? "deepseek-chat";

/** 문제당 LLM 동시 호출 수 (rate limit/비용 고려, 최소 1) */
export const CBT_LLM_CONCURRENCY = Math.max(
  1,
  envInt("CBT_LLM_CONCURRENCY", 3),
);

/** retry 최대 횟수 (network/timeout/429/5xx 대상) */
export const CBT_LLM_MAX_RETRIES = Math.max(0, envInt("CBT_LLM_MAX_RETRIES", 3));

/** LLM 호출 1회 타임아웃 (ms) */
export const CBT_LLM_TIMEOUT_MS = Math.max(0, envInt("CBT_LLM_TIMEOUT_MS", 60000));

/** retry 지수 backoff 기본 간격 (ms) */
export const CBT_RETRY_BASE_DELAY_MS = envInt("CBT_RETRY_BASE_DELAY_MS", 1000);
