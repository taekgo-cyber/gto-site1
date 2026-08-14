// hand-rolled 제한 concurrency 실행기 (Session 10-1 PLAN §15).
// 복잡한 Queue 시스템 없이 N개 항목을 동시 처리한다.
// worker는 항목과 index를 받고, 결과는 입력 순서 그대로 배열로 반환한다.

export type PoolWorker<T, R> = (item: T, index: number) => Promise<R>;

export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: PoolWorker<T, R>,
): Promise<R[]> {
  const workerCount = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let next = 0;

  async function pump(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const activeWorkers = Array.from(
    { length: Math.min(workerCount, items.length) },
    () => pump(),
  );
  await Promise.all(activeWorkers);

  return results;
}
