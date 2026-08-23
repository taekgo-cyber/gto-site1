// Phase 0 D — durable run log / runId (fail-closed).
// batch 실행마다 runId(JSONL 파일)로 시작/아이템 결과/종료를 기록한다.
// - fail-closed: run 시작 전에 로그 파일을 열 수 없으면(디렉터리 생성/append 실패) throw.
//   로그를 기록할 수 없는 상태에서 batch가 DB/LLM 쓰기를 시작하지 않는다.
// - append-only: 한 항목을 건너뛰지 않고 순서대로 추가한다.
// - mid-run append 실패 → broken=true, 이후 항목은 스케줄링하지 않는다 (orchestrator 판단).
// - run_end는 aborted/abortReason을 기록해 CLI가 exit 1을 결정할 수 있게 한다.
// - resume: readRunLog에서 '실패한 item' + 'item_result가 없는 incomplete 대상'을
//   재진입 대상으로 복원한다.
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type RunStartEntry = {
      type: "run_start";
      runId: string;
      command: string;
      args: string[];
      targets: string[];
      total: number;
      /** 실제 병렬도 (순차면 1, pool 기반이면 적용 concurrency) */
      concurrency?: number;
      /** Gate 2 recovery 등 특수 실행의 provenance. legacy run에는 없다. */
      runType?: "gate2_post_failure_recovery";
      policyVersion?: string;
      lane?: "contract" | "provider";
      parentRunId?: string;
      targetSetHash?: string;
      createdAt: string;
    };

export type RunLogEntry =
  | RunStartEntry
  | {
      type: "item_result";
      runId: string;
      itemId: string;
      outcome: "succeeded" | "failed";
      detail?: string;
      at: string;
    }
  | {
      type: "run_end";
      runId: string;
      succeeded: number;
      failed: number;
      durationMs: number;
      endedAt: string;
      /** 전체 완료가 아닌 중단 종료 (로그 실패/breaker 오픈 등) */
      aborted?: boolean;
      abortReason?: string;
    };

export type AbortReason = "log_failure" | "circuit_open" | "recovery_stop" | "transient_failure" | "consecutive_transient_limit" | "terminal_failure";

export class RunLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunLogError";
  }
}

export function createRunId(): string {
  return randomUUID();
}

/** runId를 파일명으로 변환 (조작된 runId 경로 탈출 방지) */
function runFilePath(dir: string, runId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new RunLogError(`파일명으로 쓸 수 없는 runId: ${runId}`);
  }
  return path.join(dir, `${runId}.jsonl`);
}

/**
 * run 로그 헤더(단일 entry)를 append한다. 실패 시 throw (fail-closed).
 * 디렉터리를 재귀 생성한다. append mode이므로 기존 파일이 있어도 이어쓴다.
 */
async function appendRawEntry(
  dir: string,
  entry: RunLogEntry,
): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
    const filePath = runFilePath(dir, entry.runId);
    await appendFile(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    throw new RunLogError(
      `run log append 실패 (${dir}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * runId JSONL 파일을 열며 run_start를 기록한다 (fail-closed).
 * 디렉터리를 재귀 생성하고 기존 파일이 있으면 이어쓴다.
 * 실패 시 throw → 실행 시작 전에 중단한다.
 */
export async function openRunLog(
  dir: string,
  entry: RunLogEntry & { type: "run_start" },
): Promise<{ runId: string; filePath: string }> {
  await appendRawEntry(dir, entry);
  return { runId: entry.runId, filePath: runFilePath(dir, entry.runId) };
}

/** 항목 결과를 append한다. 실패 시 throw (fail-closed 유지) */
export async function appendRunLogEntry(
  dir: string,
  entry: RunLogEntry,
): Promise<void> {
  await appendRawEntry(dir, entry);
}

// ---------------------------------------------------------------------------
// RunLogSession — 4개 batch 실행 진입점(ingest/generate/review/promote) 공통 사용
// ---------------------------------------------------------------------------

export type RunLogSessionOptions = {
  dir: string;
  command: string;
  args: string[];
  targets: string[];
  total: number;
  /** effective concurrency (순차=1, pool=적용값). run_start에 기록 */
  concurrency?: number | null;
  /** append 주입 (테스트 전용. 기본 appendRunLogEntry) — run_start에도 적용된다 */
  append?: (dir: string, entry: RunLogEntry) => Promise<void>;
  recovery?: {
    policyVersion: string;
    lane: "contract" | "provider";
    parentRunId: string;
    targetSetHash: string;
  };
};

export type RunLogSession = {
  runId: string;
  /** 중간에 append가 실패했는지. true면 신규 항목 스케줄링을 중단해야 한다 */
  isBroken(): boolean;
  /**
   * 항목 결과를 기록한다. 실패하면 broken=true가 되고 false를 반환한다.
   * broken 상태에서 호출하면 즉시 false (기록 시도하지 않음). 비동기 append를 await한다.
   */
  appendItem(
    itemId: string,
    outcome: "succeeded" | "failed",
    detail?: string,
  ): Promise<boolean>;
  /** run_end 기록. broken이면 aborted(log_failure)를 반영. 직접 meta.aborted로 재정의 가능 */
  finish(
    succeeded: number,
    failed: number,
    durationMs: number,
    meta?: { aborted?: boolean; abortReason?: AbortReason },
  ): Promise<void>;
};

/**
 * 실행을 시작하며 run_start를 기록한다 (fail-closed).
 * run_start 포함 모든 append는 주입된 append 경로(dir 생성 후)를 사용한다.
 * 시작 실패 시 throw → 호출 경로는 DB/LLM 쓰기 전에 실행을 거부한다.
 */
export async function createRunLogSession(
  opts: RunLogSessionOptions,
): Promise<RunLogSession> {
  const append = opts.append ?? appendRunLogEntry;
  const runId = createRunId();

  try {
    await mkdir(opts.dir, { recursive: true });
    const start: RunStartEntry = {
      type: "run_start",
      runId,
      command: opts.command,
      args: opts.args,
      targets: opts.targets,
      total: opts.total,
      concurrency: opts.concurrency ?? undefined,
      ...(opts.recovery
        ? {
            runType: "gate2_post_failure_recovery" as const,
            policyVersion: opts.recovery.policyVersion,
            lane: opts.recovery.lane,
            parentRunId: opts.recovery.parentRunId,
            targetSetHash: opts.recovery.targetSetHash,
          }
        : {}),
      createdAt: new Date().toISOString(),
    };
    await append(opts.dir, start);
  } catch (err) {
    throw new RunLogError(
      `run log를 열 수 없어 실행을 거부합니다 (${opts.dir}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  let broken = false;

  return {
    runId,
    isBroken: () => broken,
    async appendItem(itemId, outcome, detail?) {
      if (broken) return false;
      try {
        await append(opts.dir, {
          type: "item_result",
          runId,
          itemId,
          outcome,
          ...(detail !== undefined ? { detail } : {}),
          at: new Date().toISOString(),
        });
        return true;
      } catch {
        broken = true;
        return false;
      }
    },
    async finish(succeeded, failed, durationMs, meta) {
      let aborted = meta?.aborted === true;
      let abortReason = meta?.abortReason;
      // 항목 기록이 깨졌으면 기본적으로 log_failure로 중단 처리
      if (broken) {
        aborted = true;
        abortReason = abortReason ?? "log_failure";
      }
      try {
        await append(opts.dir, {
          type: "run_end",
          runId,
          succeeded,
          failed,
          durationMs,
          endedAt: new Date().toISOString(),
          aborted: aborted || undefined,
          abortReason,
        });
      } catch (err) {
        throw new RunLogError(
          `run end 기록 실패 (runId=${runId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
  };
}

export type RunLogRead = {
  entries: RunLogEntry[];
  runId: string;
  runStart: RunStartEntry;
  /** run_start.targets (원래 대상 목록) */
  targets: string[];
  /**
   * 재진입 대상 ID: 실패한 item + item_result가 없는(incomplete) 대상.
   * resume 시 이 목록만 명시 대상으로 되돌려 안전하게 재시도한다.
   */
  failedItemIds: string[];
  runEnd: (RunLogEntry & { type: "run_end" }) | null;
};

/** 기존 run 로그를 읽는다. 파일이 없거나 손상되면 throw (resume 신뢰성) */
export async function readRunLog(dir: string, runId: string): Promise<RunLogRead> {
  let content: string;
  try {
    content = await readFile(runFilePath(dir, runId), "utf8");
  } catch {
    throw new RunLogError(`run log를 찾을 수 없습니다: ${runId}`);
  }

  const entries: RunLogEntry[] = [];
  let targets: string[] = [];
  let runStart: RunStartEntry | null = null;
  let runEnd: (RunLogEntry & { type: "run_end" }) | null = null;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new RunLogError(
        `run log 손상 (${runId}, line ${index + 1}): JSON 파싱 실패`,
      );
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { type?: unknown }).type !== "string"
    ) {
      throw new RunLogError(`run log 손상 (${runId}, line ${index + 1}): 형식 불일치`);
    }
    const entry = parsed as RunLogEntry;
    entries.push(entry);
    if (entry.type === "run_start") {
      targets = entry.targets;
      runStart = entry;
    }
    if (entry.type === "run_end") runEnd = entry;
  }

  // 1) 명시적으로 failed인 item
  const explicitlyFailed = new Set(
    entries
      .filter(
        (e): e is Extract<RunLogEntry, { type: "item_result" }> =>
          e.type === "item_result",
      )
      .filter((e) => e.outcome === "failed")
      .map((e) => e.itemId),
  );
  // 2) item_result가 없는 incomplete 대상 (중간 중단/로그 유실)
  const recorded = new Set(
    entries
      .filter(
        (e): e is Extract<RunLogEntry, { type: "item_result" }> =>
          e.type === "item_result",
      )
      .map((e) => e.itemId),
  );
  const incomplete = targets.filter((t) => !recorded.has(t));

  const failedItemIds = Array.from(
    new Set([...explicitlyFailed, ...incomplete]),
  );

  if (runStart === null) {
    throw new RunLogError(`run log 손상 (${runId}): run_start가 없습니다`);
  }
  return { entries, runId, runStart, targets, failedItemIds, runEnd };
}
