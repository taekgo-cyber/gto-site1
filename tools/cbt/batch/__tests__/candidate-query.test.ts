/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import type { CandidateQuestion } from "@/generated/prisma/client";
import { listGenerationTargets, type BatchCandidateDb } from "../candidate-query";

type Row = {
  id: string;
  validationStatus: string;
  createdAt: Date;
  [key: string]: unknown;
};

function makeCandidate(id: string, validationStatus: string, createdAt: number): Row {
  return {
    id,
    validationStatus,
    createdAt: new Date(createdAt),
  };
}

/** BatchCandidateDb 최소 구현 — where/select/orderBy만 필요한 범위에서 처리한다 */
function createFakeBatchDb(candidates: Row[], generatedCandidateIds: string[]) {
  const db: BatchCandidateDb = {
    candidateQuestion: {
      async findMany(args: any) {
        const where = args?.where ?? {};
        let rows = [...candidates];
        if (where.validationStatus?.not) {
          rows = rows.filter((r) => r.validationStatus !== where.validationStatus.not);
        }
        if (where.id?.in) {
          const set = new Set(where.id.in);
          rows = rows.filter((r) => set.has(r.id));
        }
        if (args?.orderBy?.createdAt) {
          const dir = args.orderBy.createdAt === "desc" ? -1 : 1;
          rows.sort((a, b) => (a.createdAt < b.createdAt ? -dir : dir));
        }
        return rows as unknown as CandidateQuestion[];
      },
    },
    generatedQuestion: {
      async findMany(args: any) {
        if (args?.select?.candidateQuestionId) {
          return generatedCandidateIds.map((candidateQuestionId) => ({
            candidateQuestionId,
            status: "GENERATED",
          }));
        }
        return [];
      },
    },
  };
  return db;
}

describe("listGenerationTargets", () => {
  it("REJECTED candidate를 제외한다", async () => {
    const db = createFakeBatchDb(
      [
        makeCandidate("cq-1", "VALID", 1),
        makeCandidate("cq-2", "REVIEW_REQUIRED", 2),
        makeCandidate("cq-3", "REJECTED", 3),
      ],
      [],
    );
    const selection = await listGenerationTargets(db);
    expect(selection.targets.map((t) => t.id)).toEqual(["cq-1", "cq-2"]);
    expect(selection.totalEligible).toBe(2);
  });

  it("기존 GeneratedQuestion이 있는 candidate를 제외한다", async () => {
    const db = createFakeBatchDb(
      [
        makeCandidate("cq-1", "VALID", 1),
        makeCandidate("cq-2", "VALID", 2),
      ],
      ["cq-1"],
    );
    const selection = await listGenerationTargets(db);
    expect(selection.targets.map((t) => t.id)).toEqual(["cq-2"]);
  });

  it("skippedExisting을 집계한다", async () => {
    const db = createFakeBatchDb(
      [
        makeCandidate("cq-1", "VALID", 1),
        makeCandidate("cq-2", "VALID", 2),
        makeCandidate("cq-3", "VALID", 3),
      ],
      ["cq-2"],
    );
    const selection = await listGenerationTargets(db);
    expect(selection.skippedExisting).toBe(1);
    expect(selection.totalEligible).toBe(2);
  });

  it("includeExisting=true이면 기존 생성 후보도 포함한다", async () => {
    const db = createFakeBatchDb(
      [
        makeCandidate("cq-1", "VALID", 1),
        makeCandidate("cq-2", "VALID", 2),
      ],
      ["cq-1"],
    );
    const selection = await listGenerationTargets(db, { includeExisting: true });
    expect(selection.targets.map((t) => t.id)).toEqual(["cq-1", "cq-2"]);
    expect(selection.skippedExisting).toBe(0);
  });

  it("결과 순서가 createdAt asc id 순서와 일치한다", async () => {
    const db = createFakeBatchDb(
      [
        makeCandidate("cq-3", "VALID", 3),
        makeCandidate("cq-1", "VALID", 1),
        makeCandidate("cq-2", "VALID", 2),
      ],
      [],
    );
    const selection = await listGenerationTargets(db);
    expect(selection.targets.map((t) => t.id)).toEqual(["cq-1", "cq-2", "cq-3"]);
  });

  it("ids 제공 시 입력 순서를 유지하고 REJECTED는 제외한다", async () => {
    const db = createFakeBatchDb(
      [
        makeCandidate("cq-a", "VALID", 1),
        makeCandidate("cq-b", "REJECTED", 2),
        makeCandidate("cq-c", "VALID", 3),
      ],
      [],
    );
    const selection = await listGenerationTargets(db, {
      ids: ["cq-c", "cq-b", "cq-a"],
    });
    expect(selection.targets.map((t) => t.id)).toEqual(["cq-c", "cq-a"]);
    expect(selection.totalEligible).toBe(2);
  });
});
