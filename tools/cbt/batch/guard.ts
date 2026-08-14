// STEP 9 — Batch 전체 실행 방지 가드 (STEP 9 BUILD HANDOFF §2.3).
// --limit 없이(그리고 --all 명시 없이) 전체 데이터를 처리하는 실수를 막는다.
// limit과 all을 동시에 지정하는 것도 금지한다.

export type BatchScopeOptions = {
  limit: number | null;
  all: boolean;
};

/**
 * 처리할 건수를 결정한다.
 * - limit과 all 동시 지정 → throw
 * - 둘 다 없음 → throw (전체 실행 방지)
 * - all → total
 * - limit → Math.min(limit, total)
 */
export function resolveBatchScope(
  opts: BatchScopeOptions,
  total: number,
): number {
  if (opts.limit !== null && opts.all) {
    throw new Error("--limit과 --all은 동시에 지정할 수 없습니다.");
  }
  if (opts.limit === null && !opts.all) {
    throw new Error("전체 실행 금지: --limit=N 또는 --all을 지정하세요.");
  }
  if (opts.all) return total;
  return Math.min(opts.limit as number, total);
}
