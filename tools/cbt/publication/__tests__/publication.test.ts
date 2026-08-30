import { describe, expect, it } from "vitest";
import { parseCbtOptions } from "@/lib/cbt/options";
import { assertLocalPublicationDatabaseBoundary } from "../boundary";
import { executeMasterPublication, planMasterPublication, publicationTargetId } from "../service";
import type {
  PublicationCategory,
  PublicationCreateInput,
  PublicationDatabase,
  PublicationMaster,
  PublicationRepository,
  PublicationTarget,
} from "../types";

function makeMaster(
  id: string,
  overrides: Partial<PublicationMaster> = {},
): PublicationMaster {
  const generatedId = `generated_${id}`;
  const candidateId = `candidate_${id}`;
  return {
    id,
    generatedQuestionId: generatedId,
    category: "CAT-LAW",
    questionText: `${id} 문제 본문`,
    choices: [
      { index: 1, text: "보기 1" },
      { index: 2, text: "보기 2" },
      { index: 3, text: "보기 3" },
      { index: 4, text: "보기 4" },
    ],
    answers: [2],
    explanation: `${id} 해설`,
    difficulty: "MEDIUM",
    isActive: true,
    publishedAt: new Date("2026-08-30T00:00:00.000Z"),
    generatedQuestion: {
      id: generatedId,
      status: "APPROVED",
      candidateQuestionId: candidateId,
      contentFingerprint: `generated-fingerprint-${id}`,
      candidateQuestion: {
        id: candidateId,
        sourceName: "newbt",
        sourceQuestionId: `source-${id}`,
        originalUrl: `https://example.test/questions/${id}`,
        contentFingerprint: `candidate-fingerprint-${id}`,
      },
    },
    ...overrides,
  };
}

function cloneTarget(target: PublicationTarget): PublicationTarget {
  return structuredClone(target);
}

function createFakeDatabase(input: {
  masters?: PublicationMaster[];
  targets?: PublicationTarget[];
  category?: PublicationCategory | null;
} = {}): PublicationDatabase & {
  targets: PublicationTarget[];
  writes: { creates: number; updates: number };
} {
  const masters = structuredClone(input.masters ?? [makeMaster("m1")]);
  const targets = structuredClone(input.targets ?? []);
  const category =
    input.category === undefined
      ? { id: "category_cargo_driver", slug: "cargo-driver", name: "화물운송종사자격시험", isActive: true }
      : input.category;
  const writes = { creates: 0, updates: 0 };

  const repository: PublicationRepository = {
    async listMasters(ids) {
      return masters
        .filter((master) => ids === null || ids.includes(master.id))
        .sort((left, right) => left.id.localeCompare(right.id));
    },
    async findCategoryBySlug(slug) {
      return category?.slug === slug ? structuredClone(category) : null;
    },
    async listTargets(ids) {
      return targets.filter((target) => ids.includes(target.id)).map(cloneTarget);
    },
    async createTarget(create: PublicationCreateInput) {
      if (targets.some((target) => target.id === create.id)) throw new Error("duplicate_target");
      const target = cloneTarget(create);
      targets.push(target);
      writes.creates += 1;
      return cloneTarget(target);
    },
    async updateTargetStatus(id, status) {
      const target = targets.find((row) => row.id === id);
      if (!target) throw new Error("target_not_found");
      target.status = status;
      writes.updates += 1;
      return cloneTarget(target);
    },
  };

  return {
    ...repository,
    targets,
    writes,
    async transaction(work) {
      const targetSnapshot = structuredClone(targets);
      const writeSnapshot = { ...writes };
      try {
        return await work(repository);
      } catch (error) {
        targets.splice(0, targets.length, ...targetSnapshot);
        writes.creates = writeSnapshot.creates;
        writes.updates = writeSnapshot.updates;
        throw error;
      }
    },
    async disconnect() {},
  };
}

describe("MasterQuestion → CbtQuestion publication", () => {
  it("maps exact content, correct answer, and provenance in a zero-write plan", async () => {
    const master = makeMaster("m1");
    const db = createFakeDatabase({ masters: [master] });

    const plan = await planMasterPublication(db, { ids: [master.id], targetStatus: "DRAFT" });

    expect(plan).toMatchObject({
      selectedCount: 1,
      selectedMasterCount: 1,
      eligibleCount: 1,
      wouldCreate: 1,
      wouldNoOp: 0,
      wouldConflict: 0,
      invalidCount: 0,
      targetStatus: "DRAFT",
      dbWrite: false,
      categoryDistribution: { 교통법규: 1 },
    });
    expect(db.writes).toEqual({ creates: 0, updates: 0 });
    expect(plan.items[0].expected).toMatchObject({
      id: publicationTargetId(master.id),
      categoryId: "category_cargo_driver",
      subject: "교통법규",
      questionText: master.questionText,
      options: [
        { id: 1, text: "보기 1" },
        { id: 2, text: "보기 2" },
        { id: 3, text: "보기 3" },
        { id: 4, text: "보기 4" },
      ],
      correctOption: 2,
      explanation: master.explanation,
      source: "master-question",
      metadata: {
        canonical: true,
        masterQuestionId: master.id,
        generatedQuestionId: master.generatedQuestionId,
        candidateQuestionId: master.generatedQuestion.candidateQuestionId,
        sourceName: "newbt",
        sourceQuestionId: "source-m1",
      },
    });
  });

  it.each([
    ["CAT-LAW", "교통법규"],
    ["CAT-HANDLING", "화물취급"],
    ["CAT-SAFETY", "안전운행"],
    ["CAT-SERVICE", "운송서비스"],
  ])("maps %s to the canonical subject %s", async (category, subject) => {
    const db = createFakeDatabase({ masters: [makeMaster("m1", { category })] });
    const plan = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(plan.items[0]).toMatchObject({ action: "CREATE", subject });
  });

  it("materializes DRAFT, then explicitly publishes it for runtime", async () => {
    const db = createFakeDatabase();
    const draft = await executeMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(draft).toMatchObject({ created: 1, published: 0, noOp: 0, postWriteVerified: true });
    expect(db.targets[0].status).toBe("DRAFT");

    const published = await executeMasterPublication(db, { ids: ["m1"], targetStatus: "PUBLISHED" });
    expect(published).toMatchObject({ created: 0, published: 1, noOp: 0, postWriteVerified: true });
    expect(db.targets[0].status).toBe("PUBLISHED");
    expect(parseCbtOptions(db.targets[0].options)).toHaveLength(4);
  });

  it("can execute an explicit publish from a missing target through DRAFT + read-back", async () => {
    const db = createFakeDatabase();
    const result = await executeMasterPublication(db, { ids: ["m1"], targetStatus: "PUBLISHED" });
    expect(result).toMatchObject({ created: 1, published: 1, postWriteVerified: true });
    expect(db.writes).toEqual({ creates: 1, updates: 1 });
    expect(db.targets[0].status).toBe("PUBLISHED");
  });

  it("is idempotent on the second run", async () => {
    const db = createFakeDatabase();
    await executeMasterPublication(db, { ids: ["m1"], targetStatus: "PUBLISHED" });
    const second = await executeMasterPublication(db, { ids: ["m1"], targetStatus: "PUBLISHED" });
    expect(second).toMatchObject({ created: 0, published: 0, noOp: 1 });
    expect(db.targets).toHaveLength(1);
  });

  it("stops on an incompatible existing target without overwriting it", async () => {
    const seed = createFakeDatabase();
    await executeMasterPublication(seed, { ids: ["m1"], targetStatus: "DRAFT" });
    const conflicting = cloneTarget(seed.targets[0]);
    conflicting.questionText = "외부에서 변경된 공개 문제";
    const db = createFakeDatabase({ targets: [conflicting] });

    const plan = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(plan).toMatchObject({ wouldConflict: 1, wouldCreate: 0 });
    await expect(
      executeMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" }),
    ).rejects.toThrow("publication_plan_blocked");
    expect(db.targets[0].questionText).toBe("외부에서 변경된 공개 문제");
    expect(db.writes).toEqual({ creates: 0, updates: 0 });
  });

  it.each([
    ["empty question", { questionText: " " }, "question_text_missing"],
    ["invalid choices", { choices: [{ index: 1, text: "하나" }] }, "choices_count_invalid"],
    ["invalid answer", { answers: [9] }, "answer_out_of_range"],
    ["multiple answers", { answers: [1, 2] }, "single_answer_required"],
    ["unknown category", { category: "CAT-UNKNOWN" }, "category_invalid"],
  ])("rejects %s", async (_name, overrides, reason) => {
    const db = createFakeDatabase({ masters: [makeMaster("m1", overrides as Partial<PublicationMaster>)] });
    const plan = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(plan.invalidCount).toBe(1);
    expect(plan.items[0].reasons.join(",")).toContain(reason);
  });

  it("requires approved, active, promoted canonical state", async () => {
    const master = makeMaster("m1", { isActive: false, publishedAt: null });
    master.generatedQuestion.status = "QA_PASSED";
    const db = createFakeDatabase({ masters: [master] });
    const plan = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(plan.items[0].reasons).toEqual(
      expect.arrayContaining([
        "master_inactive",
        "master_published_at_missing",
        "generated_question_not_approved",
      ]),
    );
  });

  it("rejects missing provenance and missing canonical category", async () => {
    const master = makeMaster("m1");
    master.generatedQuestion.candidateQuestion.sourceQuestionId = "";
    const db = createFakeDatabase({ masters: [master], category: null });
    const plan = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(plan.items[0].reasons).toEqual(
      expect.arrayContaining(["source_question_id_missing", "category_missing:cargo-driver"]),
    );
  });

  it("does not reuse or mutate sample/test rows", async () => {
    const sample: PublicationTarget = {
      id: "sample-1",
      categoryId: "category_cargo_driver",
      subject: "교통법규",
      questionText: "샘플",
      options: [{ id: 1, text: "샘플 보기" }],
      correctOption: 1,
      explanation: "샘플 해설",
      imageUrl: null,
      status: "PUBLISHED",
      source: "test",
      metadata: { sample: true },
    };
    const db = createFakeDatabase({ targets: [sample] });
    await executeMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(db.targets).toHaveLength(2);
    expect(db.targets.find((target) => target.id === "sample-1")).toEqual(sample);
    expect(db.targets.find((target) => target.id === publicationTargetId("m1"))?.source).toBe(
      "master-question",
    );
  });

  it("only modifies explicitly requested master IDs", async () => {
    const db = createFakeDatabase({ masters: [makeMaster("m1"), makeMaster("m2")] });
    await executeMasterPublication(db, { ids: ["m2"], targetStatus: "DRAFT" });
    expect(db.targets.map((target) => target.id)).toEqual([publicationTargetId("m2")]);
  });

  it("reports missing selected IDs as invalid", async () => {
    const db = createFakeDatabase();
    const plan = await planMasterPublication(db, { ids: ["missing"], targetStatus: "DRAFT" });
    expect(plan).toMatchObject({ selectedCount: 1, selectedMasterCount: 0, invalidCount: 1 });
    expect(plan.items[0].reasons).toEqual(["master_not_found"]);
  });

  it("produces a deterministic plan checksum", async () => {
    const db = createFakeDatabase();
    const first = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    const second = await planMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    expect(first.planId).toMatch(/^[a-f0-9]{64}$/);
    expect(first.planId).toBe(second.planId);
  });

  it("treats a matching HIDDEN target as a conflict", async () => {
    const db = createFakeDatabase();
    await executeMasterPublication(db, { ids: ["m1"], targetStatus: "DRAFT" });
    db.targets[0].status = "HIDDEN";
    const plan = await planMasterPublication(db, { ids: ["m1"], targetStatus: "PUBLISHED" });
    expect(plan.items[0]).toMatchObject({ action: "CONFLICT", reasons: ["existing_target_hidden"] });
  });
});

describe("publication database boundary", () => {
  it("accepts only a non-production loopback PostgreSQL target", () => {
    expect(() =>
      assertLocalPublicationDatabaseBoundary({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/gto_test",
      }),
    ).not.toThrow();
  });

  it("rejects non-loopback and production execution", () => {
    expect(() =>
      assertLocalPublicationDatabaseBoundary({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://user:password@db.example.com:5432/gto",
      }),
    ).toThrow("publication_non_loopback_database_forbidden");
    expect(() =>
      assertLocalPublicationDatabaseBoundary({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/gto",
      }),
    ).toThrow("publication_production_node_env_forbidden");
  });
});
