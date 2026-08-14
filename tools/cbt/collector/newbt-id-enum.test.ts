// STEP 10-3 — newbt-id-enum 유닛 테스트.
// - fetch를 stubGlobal로 목킹해 API 응답을 시뮬레이션한다.
// - 직렬 순회: firstQuestion → nextQuestion 반복, id 재등장 시 종료.
// - 루프 가드, nextQuestion 실패 시 failed.
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  enumerateNewbtSerial,
  fetchNewbtSerials,
  NEWBT_SERIAL_LOOP_GUARD,
} from "./newbt-id-enum";
import type { CbtSourceDef } from "../sources.config";

const NEWBT_SOURCE = {
  sourceName: "NEWBT-HWMUL",
  category: "UNKNOWN",
  urlTemplate: "https://newbt.kr/문제/{id}",
  idRanges: [],
  answerLocation: "separate",
  status: "configured",
} as CbtSourceDef;

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fail(): Response {
  return new Response(JSON.stringify({ success: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** 첫 3문제 [10, 11, 12]가 순환하는 직렬. loop=true면 12→10으로 순환 */
function buildCycle(paths: Array<{ first: number; seq: number[]; loop: boolean }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/question/firstQuestion/")) {
      const qid = Number(url.split("/").pop());
      const spec = paths.find((p) => p.first === qid) ?? paths[0];
      return ok({ id: spec.seq[0], number: 1 });
    }
    if (url.includes("/question/nextQuestion/")) {
      const qid = Number(url.split("/").pop());
      for (const spec of paths) {
        const idx = spec.seq.indexOf(qid);
        if (idx === -1) continue;
        const next = spec.seq[idx + 1];
        if (next == null) {
          return spec.loop ? ok({ id: spec.seq[0], number: 1 }) : fail();
        }
        return ok({ id: next, number: idx + 2 });
      }
      return fail();
    }
    throw new Error(`unexpected url: ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("enumerateNewbtSerial", () => {
  it("firstQuestion 이후 nextQuestion을 따라 직렬 전체를 순회하고 id 재등장 시 종료한다", async () => {
    vi.stubGlobal("fetch", buildCycle([{ first: 10, seq: [10, 11, 12], loop: true }]));
    const result = await enumerateNewbtSerial(NEWBT_SOURCE, 10);
    expect(result).toEqual({ kind: "ok", serialId: null, ids: [10, 11, 12] });
  });

  it("nextQuestion 실패 시 failed를 반환한다", async () => {
    // 직렬 끝(12)에서 next가 없으면(loop=false) 서버는 순환해야 하지만
    // 실패로 응답하는 경우 failed 처리.
    vi.stubGlobal(
      "fetch",
      buildCycle([{ first: 10, seq: [10, 11, 12], loop: false }]),
    );
    const result = await enumerateNewbtSerial(NEWBT_SOURCE, 10);
    expect(result.kind).toBe("failed");
  });

  it("루프 가드 초과 시 failed를 반환한다", async () => {
    // next가 항상 새 id를 반환해 무한히 계속되는 직렬
    let n = 1;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/question/firstQuestion/")) return ok({ id: 1, number: 1 });
        n += 1;
        return ok({ id: n, number: n });
      }),
    );
    const result = await enumerateNewbtSerial(NEWBT_SOURCE, 1);
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.error).toContain(String(NEWBT_SERIAL_LOOP_GUARD));
    }
  });
});

describe("fetchNewbtSerials", () => {
  it("serialAllList 응답을 파싱한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ok([
          { serial: "[제1회 실전모의고사]", id: "1967", exam: "241", date: "2025-10-16" },
          { serial: "[제2회 실전모의고사]", id: "1968", exam: "241", date: "2025-10-22" },
        ]),
      ),
    );
    const result = await fetchNewbtSerials(NEWBT_SOURCE);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.serials.map((s) => s.id)).toEqual(["1967", "1968"]);
    }
  });

  it("success=false면 failed를 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail()));
    const result = await fetchNewbtSerials(NEWBT_SOURCE);
    expect(result.kind).toBe("failed");
  });
});
