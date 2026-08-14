/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 10-4 — category-backfill 유닛 테스트.
import { describe, expect, it, vi, afterEach } from "vitest";
import { runCategoryBackfill } from "../category-backfill";

type Row = any;

function makeDb(rows: Row[]) {
  return {
    candidateQuestion: {
      async findMany(args: any) {
        const where = args?.where ?? {};
        let out = [...rows];
        if (where.sourceName) out = out.filter((r) => r.sourceName === where.sourceName);
        if (where.sourceQuestionId?.in) {
          const set = new Set(where.sourceQuestionId.in);
          out = out.filter((r) => set.has(r.sourceQuestionId));
        }
        return out;
      },
      async update(args: any) {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error("candidate not found");
        Object.assign(row, args.data);
        return row;
      },
    },
  };
}

function seedRow(overrides: Row): Row {
  return {
    id: overrides.id ?? "cq_1",
    sourceName: overrides.sourceName ?? "NEWBT-HWMUL",
    sourceQuestionId: overrides.sourceQuestionId ?? "92449",
    category: overrides.category ?? null,
    validationStatus: overrides.validationStatus ?? "REVIEW_REQUIRED",
    validationErrors: overrides.validationErrors ?? ["category_unclassified"],
  };
}

const logger = { info() {}, progress() {}, error() {} } as any;

describe("runCategoryBackfill", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("배정표에 있는 후보만 category를 갱신하고 category_unclassified를 제거한다", async () => {
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "92449" }),
      seedRow({
        id: "cq_2",
        sourceQuestionId: "99999",
        validationStatus: "REVIEW_REQUIRED",
        validationErrors: ["category_unclassified"],
      }),
    ];
    const db = makeDb(rows);

    const summary = await runCategoryBackfill(
      { sourceName: "NEWBT-HWMUL", all: true },
      { db: db as any, logger },
    );

    expect(summary.total).toBe(1);
    expect(rows[0].category).toBe("CAT-LAW");
    expect(rows[0].validationErrors).toEqual([]);
    expect(rows[0].validationStatus).toBe("VALID");
    expect(rows[1].category).toBeNull();
  });

  it("그 외 validationErrors가 남아 있으면 VALID 승격 없이 오류만 남긴다", async () => {
    const rows = [
      seedRow({
        id: "cq_1",
        sourceQuestionId: "92449",
        validationErrors: ["category_unclassified", "explanation_reference"],
      }),
    ];
    const db = makeDb(rows);

    const summary = await runCategoryBackfill(
      { sourceName: "NEWBT-HWMUL", all: true },
      { db: db as any, logger },
    );

    expect(summary.applied).toBe(1);
    expect(rows[0].category).toBe("CAT-LAW");
    expect(rows[0].validationErrors).toEqual(["explanation_reference"]);
    expect(rows[0].validationStatus).toBe("REVIEW_REQUIRED");
  });

  it("이미 같은 category면 skipped 처리하고 DB를 건드리지 않는다", async () => {
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "92449", category: "CAT-LAW" }),
    ];
    const db = makeDb(rows);

    const summary = await runCategoryBackfill(
      { sourceName: "NEWBT-HWMUL", all: true },
      { db: db as any, logger },
    );

    expect(summary.applied).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it("VALID 오분류 교정 대상은 category만 교체하고 상태는 유지한다", async () => {
    const rows = [
      seedRow({
        id: "cq_1",
        sourceQuestionId: "92502",
        category: "CAT-LAW",
        validationStatus: "VALID",
        validationErrors: [],
      }),
    ];
    const db = makeDb(rows);

    const summary = await runCategoryBackfill(
      { sourceName: "NEWBT-HWMUL", all: true },
      { db: db as any, logger },
    );

    expect(summary.applied).toBe(1);
    expect(rows[0].category).toBe("CAT-SAFETY");
    expect(rows[0].validationStatus).toBe("VALID");
    expect(rows[0].validationErrors).toEqual([]);
  });

  it("dry-run은 DB update를 호출하지 않는다", async () => {
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "92449" }),
    ];
    const db = makeDb(rows);
    const updateSpy = vi.spyOn(db.candidateQuestion, "update");

    const summary = await runCategoryBackfill(
      { sourceName: "NEWBT-HWMUL", all: true, dryRun: true },
      { db: db as any, logger },
    );

    expect(summary.applied).toBe(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(rows[0].category).toBeNull();
  });
});
