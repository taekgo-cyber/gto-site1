// STEP 9 — Batch Runner 공용 타입 (STEP 9 BUILD HANDOFF §2.1).
// batch-ingest / batch-generate 두 CLI와 orchestration 모듈에서 공유한다.
// No Drop: 개별 실패는 실패 상태로 보존하고 배치를 중단시키지 않는다.

/** ingest 건별 처리 결과 상태 */
export type IngestOutcome =
  | "collected"
  | "skipped"
  | "persisted"
  | "failed";

export type IngestItemResult = {
  sourceQuestionId: string;
  outcome: IngestOutcome;
  candidateId?: string;
  /** persist 결과: 신규 생성(true) vs 기존 레코드 재사용(false) */
  created?: boolean;
  validationStatus?: string;
  error?: string;
  durationMs: number;
};

/** generate 건별 처리 결과 상태 */
export type GenerateOutcome = "generated" | "failed";

export type GenerateItemResult = {
  candidateId: string;
  outcome: GenerateOutcome;
  generatedQuestionId?: string;
  /** GeneratedQuestionStatus (QA_PASSED / QA_FAILED / FAILED) */
  status?: string;
  error?: string;
  durationMs: number;
};

/** 배치 실행 최종 요약 */
export type BatchSummary<T> = {
  /** durable run log의 runId (Phase 0 D). batch-generate에서 세팅 */
  runId?: string;
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  results: T[];
  durationMs: number;
  /** 중단 종료 여부 (run log 실패 / circuit open 등) */
  aborted?: boolean;
  /** 중단 사유. aborted=true일 때 설정 */
  abortReason?: AbortReason;
};

export type AbortReason = "log_failure" | "circuit_open" | "recovery_stop" | "transient_failure" | "consecutive_transient_limit" | "terminal_failure";
