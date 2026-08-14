/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 10 — batch review/promote/audit 테스트용 fake DB.
// ContentDb(STEP 8) + BatchContentDb(findMany)를 공유 store 위에서 구현한다.
// 기존 content/__tests__/fakeContentDb.ts를 수정하지 않고 별도로 정의한다.
// $transaction은 스냅샷 롤백으로 원자성을 시뮬레이션한다.
import type { ContentDb } from "../../content/persist/content-repository";
import type { BatchContentDb } from "../content-query";
import type { AuditDb } from "../audit";

type Row = any;

export type FakeBatchContentDb = ReturnType<typeof createFakeBatchContentDb>;

export function createFakeBatchContentDb() {
  let gqSeq = 0;
  let masterSeq = 0;

  const candidates: Row[] = [];
  const generatedQuestions: Row[] = [];
  const masterQuestions: Row[] = [];

  const findCqById = (id: string) => candidates.find((r) => r.id === id) ?? null;
  const findGqById = (id: string) =>
    generatedQuestions.find((r) => r.id === id) ?? null;
  const findMasterByGq = (gqId: string) =>
    masterQuestions.find((r) => r.generatedQuestionId === gqId) ?? null;

  // --- ContentDb ---------------------------------------------------------
  const contentDb: ContentDb = {
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
        return {
          id: `qa_${gqSeq}`,
          ...args?.data,
          createdAt: new Date(),
        };
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
        return await fn(contentDb);
      } catch (err) {
        restoreStore(snapshot);
        throw err;
      }
    },
  };

  // --- BatchContentDb (findMany) -----------------------------------------
  const batchContentDb: BatchContentDb = {
    generatedQuestion: {
      async findMany(args: any) {
        const where = args?.where ?? {};
        let rows = [...generatedQuestions];
        if (where.status) {
          rows = rows.filter((r) => r.status === where.status);
        }
        if (args?.orderBy?.createdAt) {
          const dir = args.orderBy.createdAt === "desc" ? -1 : 1;
          rows.sort((a, b) => (a.createdAt < b.createdAt ? -dir : dir));
        }
        return rows;
      },
    },
  };

  // --- AuditDb (findMany 3종) ---------------------------------------------
  const auditDb: AuditDb = {
    masterQuestion: {
      async findMany() {
        return [...masterQuestions];
      },
    },
    generatedQuestion: {
      async findMany() {
        return [...generatedQuestions];
      },
    },
    candidateQuestion: {
      async findMany() {
        return [...candidates];
      },
    },
  };

  function snapshotStore() {
    return {
      candidates: candidates.map((r) => ({ ...r })),
      generatedQuestions: generatedQuestions.map((r) => ({ ...r })),
      masterQuestions: masterQuestions.map((r) => ({ ...r })),
    };
  }

  function restoreStore(snap: ReturnType<typeof snapshotStore>) {
    candidates.length = 0;
    candidates.push(...snap.candidates);
    generatedQuestions.length = 0;
    generatedQuestions.push(...snap.generatedQuestions);
    masterQuestions.length = 0;
    masterQuestions.push(...snap.masterQuestions);
  }

  return {
    contentDb,
    batchContentDb,
    auditDb,
    store: {
      candidates,
      generatedQuestions,
      masterQuestions,
    },
    helpers: {
      seedCandidate(row: Row) {
        const seeded: Row = {
          id: `cq_${row.id ?? "c1"}`,
          sourceName: row.sourceName ?? "test-source",
          sourceQuestionId: row.sourceQuestionId ?? "q-1",
          originalUrl: row.originalUrl ?? "https://example.test/q-1",
          fetchedAt: row.fetchedAt ?? new Date("2026-08-14T00:00:00Z"),
          rawHtmlSnippetId: row.rawHtmlSnippetId ?? "snip-1",
          category: row.category ?? "CAT-HANDLING",
          classificationMethod: row.classificationMethod ?? "source",
          questionNumber: row.questionNumber ?? 1,
          questionText: row.questionText ?? "화물 적재 시 올바른 방법은?",
          choices:
            row.choices ?? [
              { index: 1, text: "A" },
              { index: 2, text: "B" },
              { index: 3, text: "C" },
              { index: 4, text: "D" },
            ],
          normalizedAnswers: row.normalizedAnswers ?? [2],
          explanation: row.explanation ?? "설명",
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
      /** GeneratedQuestion을 상태/내용과 함께 삽입. 반환 id를 사용 */
      seedGenerated(overrides: Row) {
        const row: Row = {
          id: overrides.id ?? `gq_${++gqSeq}`,
          candidateQuestionId:
            overrides.candidateQuestionId ?? "cq_c1",
          status: overrides.status ?? "QA_PASSED",
          questionText:
            overrides.questionText ?? "화물 적재 시 올바른 방법은?",
          choices:
            overrides.choices ?? [
              { index: 1, text: "A" },
              { index: 2, text: "B" },
              { index: 3, text: "C" },
              { index: 4, text: "D" },
            ],
          answers: overrides.answers ?? [2],
          explanation: overrides.explanation ?? "설명",
          category: overrides.category ?? "CAT-HANDLING",
          difficulty: overrides.difficulty ?? "MEDIUM",
          reviewedBy: overrides.reviewedBy ?? null,
          reviewedAt: overrides.reviewedAt ?? null,
          createdAt: overrides.createdAt ?? new Date(),
          updatedAt: new Date(),
        };
        generatedQuestions.push(row);
        return row;
      },
    },
  };
}
