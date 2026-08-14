import { describe, expect, it } from "vitest";
import { runPool } from "../pipeline/pool";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runPool", () => {
  it("입력 순서대로 결과를 반환한다", async () => {
    const results = await runPool([10, 20, 30], 2, async (n) => n * 2);
    expect(results).toEqual([20, 40, 60]);
  });

  it("concurrency를 초과하지 않고 병렬 실행한다", async () => {
    let active = 0;
    let maxActive = 0;

    await runPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active -= 1;
    });

    expect(maxActive).toBe(3);
  });

  it("concurrency가 0이거나 음수여도 최소 1로 동작한다", async () => {
    const results = await runPool([1, 2, 3], 0, async (n) => n);
    expect(results).toEqual([1, 2, 3]);

    const results2 = await runPool([1, 2, 3], -2, async (n) => n);
    expect(results2).toEqual([1, 2, 3]);
  });

  it("빈 배열이면 빈 결과를 반환한다", async () => {
    const results = await runPool([], 3, async () => 1);
    expect(results).toEqual([]);
  });

  it("항목보다 concurrency가 커도 안전하게 동작한다", async () => {
    const results = await runPool([1, 2], 10, async (n) => n + 1);
    expect(results).toEqual([2, 3]);
  });

  it("worker 오류가 발생하면 전체가 실패하고 전파한다", async () => {
    await expect(
      runPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("worker가 index를 전달받는다", async () => {
    const items = ["a", "b", "c"];
    const seen: number[] = [];
    await runPool(items, 1, async (item, index) => {
      seen.push(index);
      expect(item).toBe(items[index]);
    });
    expect(seen).toEqual([0, 1, 2]);
  });

  it("동시성 1로 순차 처리된다", async () => {
    const order: number[] = [];
    await runPool([1, 2, 3], 1, async (n) => {
      order.push(n);
      await delay(1);
    });
    expect(order).toEqual([1, 2, 3]);
  });
});
