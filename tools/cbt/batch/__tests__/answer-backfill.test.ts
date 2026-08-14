/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 10-2 — answer-backfill orchestration 테스트.
// - 대상 선택: REVIEW_REQUIRED + normalizedAnswers=[] 인 후보만 대상.
// - 정답 백필 성공 → normalizedAnswers 갱신 + VALID 승격 + PENDING review RESOLVED.
// - dry-run: API/DB 쓰기 0회.
// - 개별 실패(failed/empty)는 batch를 중단시키지 않는다.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runAnswerBackfill } from "../answer-backfill";
import * as answerFetch from "../../collector/answer-fetch";

type Row = any;

function makeDb(rows: Row[]) {
  const reviews: Array<{
    candidateQuestionId: string;
    reviewStatus: string;
    resolvedAt?: Date;
  }> = [];
  return {
    db: {
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
      candidateReview: {
        async findUnique(args: any) {
          return reviews.find((r) => r.candidateQuestionId === args.where.candidateQuestionId) ?? null;
        },
        async update(args: any) {
          const rev = reviews.find((r) => r.candidateQuestionId === args.where.candidateQuestionId);
          if (!rev) throw new Error("review not found");
          Object.assign(rev, args.data);
          return rev;
        },
      },
    },
    reviews,
  };
}

function seedRow(overrides: Row): Row {
  return {
    id: overrides.id ?? "cq_1",
    sourceName: overrides.sourceName ?? "NEWBT-HWMUL",
    sourceQuestionId: overrides.sourceQuestionId ?? "92628",
    questionText: overrides.questionText ?? "질문",
    choices: overrides.choices ?? [],
    normalizedAnswers: overrides.normalizedAnswers ?? [],
    validationStatus: overrides.validationStatus ?? "REVIEW_REQUIRED",
    validationErrors: overrides.validationErrors ?? ["answer_missing"],
    createdAt: new Date(),
  };
}

const SAMPLE_NEWBT_SOURCE = {
  sourceName: "NEWBT-HWMUL",
  category: "UNKNOWN",
  urlTemplate: "https://newbt.kr/문제/{id}",
  idRanges: [],
  answerLocation: "separate",
  status: "configured",
} as any;

describe("runAnswerBackfill", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi
      .spyOn(answerFetch, "fetchAnswersForNewbtId")
      .mockResolvedValue({ kind: "found", answers: [2] });
    vi.spyOn(answerFetch, "findNewbtSource").mockReturnValue(SAMPLE_NEWBT_SOURCE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("REVIEW_REQUIRED + 정답 없는 후보만 대상으로 선택한다 (VALID/REJECTED는 제외)", async () => {
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "1", validationStatus: "REVIEW_REQUIRED", validationErrors: ["answer_missing"], normalizedAnswers: [] }),
      seedRow({ id: "cq_2", sourceQuestionId: "2", validationStatus: "VALID", normalizedAnswers: [3] }),
      seedRow({ id: "cq_3", sourceQuestionId: "3", validationStatus: "REJECTED", validationErrors: ["question_text_missing"] }),
    ];
    const { db } = makeDb(rows);

    const summary = await runAnswerBackfill(
      { sourceName: "NEWBT-HWMUL", all: true },
      { db: db as any, logger: { info() {}, progress() {} } as any },
    );

    expect(summary.total).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("정답 백필 성공 시 normalizedAnswers 갱신 + VALID 승격 + PENDING review RESOLVED", async () => {
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "92628", validationErrors: ["answer_missing"], normalizedAnswers: [] }),
    ];
    const { db, reviews } = makeDb(rows);
    reviews.push({ candidateQuestionId: "cq_1", reviewStatus: "PENDING" });

    const summary = await runAnswerBackfill(
      { sourceName: "NEWBT-HWMUL", ids: ["92628"], all: true },
      { db: db as any, logger: { info() {}, progress() {} } as any },
    );

    expect(summary.backfilled).toBe(1);
    expect(rows[0].normalizedAnswers).toEqual([2]);
    expect(rows[0].validationStatus).toBe("VALID");
    expect(rows[0].validationErrors).toEqual([]);
    expect(reviews[0].reviewStatus).toBe("RESOLVED");
    expect(reviews[0].resolvedAt).toBeInstanceOf(Date);
  });

  it("그 외 validationErrors가 남아 있으면 REVIEW_REQUIRED 유지 + PENDING review 보존", async () => {
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "92628", validationErrors: ["answer_missing", "category_unclassified"], normalizedAnswers: [] }),
    ];
    const { db, reviews } = makeDb(rows);
    reviews.push({ candidateQuestionId: "cq_1", reviewStatus: "PENDING" });

    const summary = await runAnswerBackfill(
      { sourceName: "NEWBT-HWMUL", ids: ["92628"], all: true },
      { db: db as any, logger: { info() {}, progress() {} } as any },
    );

    expect(summary.backfilled).toBe(1);
    expect(rows[0].normalizedAnswers).toEqual([2]);
    expect(rows[0].validationStatus).toBe("REVIEW_REQUIRED");
    expect(rows[0].validationErrors).toEqual(["category_unclassified"]);
    expect(reviews[0].reviewStatus).toBe("PENDING");
  });

  it("API가 empty/failed 반환 시 해당 건은 skipped/failed로 기록하고 batch는 계속 진행", async () => {
    spy
      .mockResolvedValueOnce({ kind: "found", answers: [2] })
      .mockResolvedValueOnce({ kind: "empty", reason: "is_answer==1 보기가 없음" })
      .mockResolvedValueOnce({ kind: "failed", error: "HTTP 500" });
    const rows = [
      seedRow({ id: "cq_1", sourceQuestionId: "1" }),
      seedRow({ id: "cq_2", sourceQuestionId: "2" }),
      seedRow({ id: "cq_3", sourceQuestionId: "3" }),
    ];
    const { db } = makeDb(rows);

    const summary = await runAnswerBackfill(
      { sourceName: "NEWBT-HWMUL", ids: ["1", "2", "3"], all: true },
      { db: db as any, logger: { info() {}, progress() {} } as any },
    );

    expect(summary.total).toBe(3);
    expect(summary.backfilled).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(1);
    expect(rows[0].normalizedAnswers).toEqual([2]);
  });

  it("dry-run은 API/DB 호출 없이 대상만 출력한다", async () => {
    const rows = [seedRow({ id: "cq_1", sourceQuestionId: "92628" })];
    const { db } = makeDb(rows);

    const summary = await runAnswerBackfill(
      { sourceName: "NEWBT-HWMUL", ids: ["92628"], all: true, dryRun: true },
      { db: db as any, logger: { info() {}, progress() {} } as any },
    );

    expect(summary.total).toBe(1);
    expect(summary.backfilled).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(rows[0].normalizedAnswers).toEqual([]);
  });
});
