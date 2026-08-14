/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandidateDb } from "../candidate-repository";

type Row = any;

function matches(where: any, row: Row): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    if (field === "AND") {
      if (!(cond as any[]).every((part) => matches(part, row))) return false;
      continue;
    }
    if (field === "OR") {
      if (!(cond as any[]).some((part) => matches(part, row))) return false;
      continue;
    }
    if (field === "NOT") {
      if (matches(cond, row)) return false;
      continue;
    }
    const value = row[field];
    if (cond === null || cond === undefined) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (typeof cond === "object" && !(cond instanceof Date)) {
      for (const [op, operand] of Object.entries(cond)) {
        if (op === "equals") {
          if (!Object.is(value, operand)) return false;
        } else if (op === "not") {
          if (operand === null) {
            if (value === null) return false;
          } else if (Object.is(value, operand)) {
            return false;
          }
        } else if (op === "in") {
          if (value === null || !(operand as any[]).includes(value)) return false;
        }
      }
      continue;
    }
    if (!Object.is(value, cond)) return false;
  }
  return true;
}

export type FakePersistDb = ReturnType<typeof createFakePersistDb>;

export function createFakePersistDb() {
  let cqSeq = 0;
  let crSeq = 0;
  let cdgSeq = 0;
  const candidateQuestions: Row[] = [];
  const candidateReviews: Row[] = [];
  const duplicateGroups: Row[] = [];
  const duplicateMembers: Row[] = [];

  const findCqById = (id: string) =>
    candidateQuestions.find((row) => row.id === id) ?? null;

  const findCqByUnique = (sourceName: string, sourceQuestionId: string) =>
    candidateQuestions.find(
      (row) =>
        row.sourceName === sourceName &&
        row.sourceQuestionId === sourceQuestionId,
    ) ?? null;

  const db: CandidateDb = {
    candidateQuestion: {
      async findUnique(args: any) {
        const w = args?.where ?? {};
        if (w.sourceName_sourceQuestionId) {
          return findCqByUnique(
            w.sourceName_sourceQuestionId.sourceName,
            w.sourceName_sourceQuestionId.sourceQuestionId,
          );
        }
        return findCqById(w.id);
      },
      async findFirst(args: any) {
        return candidateQuestions.find((row) => matches(args?.where, row)) ?? null;
      },
      async create(args: any) {
        const row: Row = {
          id: `cq_${++cqSeq}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        candidateQuestions.push(row);
        return row;
      },
      async update(args: any) {
        const row = findCqById(args.where.id);
        if (!row) throw new Error("candidate not found");
        Object.assign(row, args.data);
        row.updatedAt = new Date();
        return row;
      },
    },
    candidateReview: {
      async findUnique(args: any) {
        return (
          candidateReviews.find(
            (row) => row.candidateQuestionId === args?.where?.candidateQuestionId,
          ) ?? null
        );
      },
      async create(args: any) {
        const row: Row = {
          id: `cr_${++crSeq}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        candidateReviews.push(row);
        return row;
      },
      async update(args: any) {
        const row = candidateReviews.find(
          (candidate) => candidate.candidateQuestionId === args.where.candidateQuestionId,
        );
        if (!row) throw new Error("review not found");
        Object.assign(row, args.data);
        row.updatedAt = new Date();
        return row;
      },
    },
    candidateDuplicateGroup: {
      async findUnique(args: any) {
        const w = args?.where ?? {};
        if (w.fingerprint) {
          return duplicateGroups.find((row) => row.fingerprint === w.fingerprint) ?? null;
        }
        return duplicateGroups.find((row) => row.id === w.id) ?? null;
      },
      async findMany(args: any) {
        return duplicateGroups.filter((row) => matches(args?.where, row));
      },
      async create(args: any) {
        const row: Row = {
          id: `cdg_${++cdgSeq}`,
          fingerprint: args.data.fingerprint,
          isResolved: args.data.isResolved ?? false,
          masterCandidateId: args.data.masterCandidateId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const members = args.data.members?.create ?? [];
        for (const member of members) {
          if (
            !duplicateMembers.some(
              (m) =>
                m.groupId === row.id &&
                m.candidateQuestionId === member.candidateQuestionId,
            )
          ) {
            duplicateMembers.push({
              groupId: row.id,
              candidateQuestionId: member.candidateQuestionId,
            });
          }
        }
        duplicateGroups.push(row);
        return row;
      },
      async delete(args: any) {
        const idx = duplicateGroups.findIndex((row) => row.id === args.where.id);
        if (idx === -1) throw new Error("group not found");
        const [removed] = duplicateGroups.splice(idx, 1);
        return removed;
      },
    },
    candidateDuplicateMember: {
      async createMany(args: any) {
        let count = 0;
        for (const item of args.data) {
          const exists = duplicateMembers.some(
            (m) =>
              m.groupId === item.groupId &&
              m.candidateQuestionId === item.candidateQuestionId,
          );
          if (args.skipDuplicates && exists) continue;
          duplicateMembers.push({
            groupId: item.groupId,
            candidateQuestionId: item.candidateQuestionId,
          });
          count += 1;
        }
        return { count };
      },
      async deleteMany(args: any) {
        const before = duplicateMembers.length;
        const toKeep = duplicateMembers.filter(
          (row) => !matches(args.where, row),
        );
        duplicateMembers.length = 0;
        duplicateMembers.push(...toKeep);
        return { count: before - toKeep.length };
      },
      async count(args: any) {
        return duplicateMembers.filter((row) => matches(args.where, row)).length;
      },
    },
    async $transaction<R>(fn: (tx: CandidateDb) => Promise<R>): Promise<R> {
      // 실제 DB 트랜잭션의 원자성을 시뮬레이션한다.
      // fn 내부에서 throw하면 스냅샷으로 복원하고 에러를 다시 던진다.
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
      candidateQuestions: candidateQuestions.map((row) => ({ ...row })),
      candidateReviews: candidateReviews.map((row) => ({ ...row })),
      duplicateGroups: duplicateGroups.map((row) => ({ ...row })),
      duplicateMembers: duplicateMembers.map((row) => ({ ...row })),
    };
  }

  function restoreStore(snap: ReturnType<typeof snapshotStore>) {
    candidateQuestions.length = 0;
    candidateQuestions.push(...snap.candidateQuestions);
    candidateReviews.length = 0;
    candidateReviews.push(...snap.candidateReviews);
    duplicateGroups.length = 0;
    duplicateGroups.push(...snap.duplicateGroups);
    duplicateMembers.length = 0;
    duplicateMembers.push(...snap.duplicateMembers);
  }

  return {
    db,
    store: {
      candidateQuestions,
      candidateReviews,
      duplicateGroups,
      duplicateMembers,
    },
  };
}
