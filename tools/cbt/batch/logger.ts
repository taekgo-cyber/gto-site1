// STEP 9 — Batch Runner console logger (STEP 9 BUILD HANDOFF §2.4).
// 외부 로거 의존성 없이 console 기반으로 진행률/요약을 출력한다.
// scope 예: "batch-ingest", "batch-generate" → "[batch-ingest]" prefix.

export type BatchLogger = {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  /** "[scope] [i/total] label" 형태의 진행률 출력 */
  progress(i: number, total: number, label: string): void;
};

export function createBatchLogger(scope: string): BatchLogger {
  const prefix = `[${scope}]`;
  return {
    info(msg: string): void {
      console.log(`${prefix} ${msg}`);
    },
    warn(msg: string): void {
      console.warn(`${prefix} ${msg}`);
    },
    error(msg: string): void {
      console.error(`${prefix} ${msg}`);
    },
    progress(i: number, total: number, label: string): void {
      console.log(`${prefix} [${i}/${total}] ${label}`);
    },
  };
}
