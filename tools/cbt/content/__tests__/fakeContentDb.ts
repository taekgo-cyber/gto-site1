/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 8 — Content 파이프라인 테스트용 fake DB.
// 실제 Prisma의 트랜잭션 원자성(rollback)을 스냅샷으로 시뮬레이션한다.
import type { ContentDb } from "../persist/content-repository";

type Row = any;

export type FakeContentDb = ReturnType<typeof createFakeContentDb>;

export function createFakeContentDb() {
  let gqSeq = 0;
  let qaSeq = 0;
  let masterSeq = 0;

  const candidates: Row[] = [];
  const generatedQuestions: Row[] = [];
  const qaRecords: Row[] = [];
  const masterQuestions: Row[] = [];

  const findCqById = (id: string) => candidates.find((r) => r.id === id) ?? null;
  const findGqById = (id: string) =>
    generatedQuestions.find((r) => r.id === id) ?? null;
  const findMasterByGq = (gqId: string) =>
    masterQuestions.find((r) => r.generatedQuestionId === gqId) ?? null;

  const db: ContentDb = {
    candidateQuestion: {
      async findUnique(args: any) {
        return findCqById(args?.where?.id);
      },
    },
    generatedQuestion: {
      async findUnique(args: any) {
        return findGqById(args?.where?.id);
      },
      async create(args: any) {
        const row: Row = {
          id: `gq_${++gqSeq}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        generatedQuestions.push(row);
        return row;
      },
      async update(args: any) {
        const row = findGqById(args.where.id);
        if (!row) throw new Error("generated question not found");
        Object.assign(row, args.data);
        row.updatedAt = new Date();
        return row;
      },
    },
    generatedQuestionQA: {
      async create(args: any) {
        const row: Row = {
          id: `qa_${++qaSeq}`,
          ...args.data,
          createdAt: new Date(),
        };
        qaRecords.push(row);
        return row;
      },
    },
    masterQuestion: {
      async findUnique(args: any) {
        const w = args?.where ?? {};
        if (w.generatedQuestionId) return findMasterByGq(w.generatedQuestionId);
        return masterQuestions.find((r) => r.id === w.id) ?? null;
      },
      async create(args: any) {
        const row: Row = {
          id: `master_${++masterSeq}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        masterQuestions.push(row);
        return row;
      },
    },
    async $transaction<R>(fn: (tx: ContentDb) => Promise<R>): Promise<R> {
      const snapshot = snapshotStore();
      try {
        return await fn(db);
      } catch (err) {
        restoreStore(snapshot);
        throw err;
      }
    },
  };

  function snapshotStore() {
    return {
      candidates: candidates.map((r) => ({ ...r })),
      generatedQuestions: generatedQuestions.map((r) => ({ ...r })),
      qaRecords: qaRecords.map((r) => ({ ...r })),
      masterQuestions: masterQuestions.map((r) => ({ ...r })),
    };
  }

  function restoreStore(snap: ReturnType<typeof snapshotStore>) {
    candidates.length = 0;
    candidates.push(...snap.candidates);
    generatedQuestions.length = 0;
    generatedQuestions.push(...snap.generatedQuestions);
    qaRecords.length = 0;
    qaRecords.push(...snap.qaRecords);
    masterQuestions.length = 0;
    masterQuestions.push(...snap.masterQuestions);
  }

  return {
    db,
    store: {
      candidates,
      generatedQuestions,
      qaRecords,
      masterQuestions,
    },
    helpers: {
      seedCandidate(row: Row) {
        const seeded: Row = {
          id: `cq_${row.id}`,
          sourceName: row.sourceName ?? "test-source",
          sourceQuestionId: row.sourceQuestionId ?? "q-1",
          originalUrl: row.originalUrl ?? "https://example.test/q-1",
          fetchedAt: row.fetchedAt ?? new Date("2026-08-14T00:00:00Z"),
          rawHtmlSnippetId: row.rawHtmlSnippetId ?? "snip-1",
          category: row.category ?? "CAT-HANDLING",
          classificationMethod: row.classificationMethod ?? "source",
          questionNumber: row.questionNumber ?? 1,
          questionText: row.questionText ?? "화물 적재 시 무게 중심을 낮춰야 하는 이유는?",
          choices:
            row.choices ?? [
              { index: 1, text: "연비 향상을 위해" },
              { index: 2, text: "전복 사고를 줄이기 위해" },
              { index: 3, text: "적재량을 늘리기 위해" },
              { index: 4, text: "하역 속도를 높이기 위해" },
            ],
          normalizedAnswers: row.normalizedAnswers ?? [2],
          explanation:
            row.explanation ??
            "무게 중심이 낮으면 차량의 안정성이 높아져 전복 사고 위험이 줄어든다.",
          images: row.images ?? [],
          validationStatus: row.validationStatus ?? "VALID",
          validationErrors: row.validationErrors ?? [],
          contentFingerprint: row.contentFingerprint ?? "cand-fp",
          createdAt: row.createdAt ?? new Date(),
          updatedAt: row.updatedAt ?? new Date(),
        };
        candidates.push(seeded);
        return seeded;
      },
    },
  };
}
