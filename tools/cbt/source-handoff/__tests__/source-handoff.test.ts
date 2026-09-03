import { describe, expect, it } from "vitest";
import {
  buildCbtSourceBundleV1,
  checksumCbtSourceJson,
  exactManifestChecksumPayload,
  validateCbtSourceBundleV1,
  verifyExact80Manifest,
} from "../bundle-v1";
import { assertStagingTargetBoundary } from "../boundary";
import { exportCbtSourceBundleV1 } from "../export";
import { CBT_SOURCE_IMPORT_APPROVAL, executeCbtSourceImportV1 } from "../import";
import { verifyOperatorArtifact } from "../operator-artifact";
import { planCbtSourceImportV1 } from "../preflight";
import { CBT_EXACT_80_MANIFEST_CHECKSUM } from "../types";
import type {
  CbtSourceBundleV1,
  SourceGraphRepository,
  SourceGraphRow,
  SourceImportDatabase,
  TargetSchemaInspection,
  VerifiedExactManifest,
} from "../types";

const HEAD = "1".repeat(40);
const CHECKSUM = CBT_EXACT_80_MANIFEST_CHECKSUM;
const TARGET = { project: "gto-site1-production", environment: "staging" as const, service: "gto-web" };

function graphRow(index: number): SourceGraphRow {
  const suffix = String(index).padStart(3, "0");
  const candidateId = `candidate_${suffix}`;
  const generatedId = `generated_${suffix}`;
  const masterId = `master_${suffix}`;
  return {
    candidate: {
      id: candidateId,
      sourceName: "NEWBT-HWMUL",
      sourceQuestionId: `source-${suffix}`,
      originalUrl: `https://newbt.example/questions/${suffix}`,
      fetchedAt: new Date("2026-08-01T00:00:00.000Z"),
      category: "CAT-LAW",
      classificationMethod: "source-map-v1",
      questionNumber: index,
      questionText: `원천 문제 ${suffix}`,
      choices: [{ index: 1, text: "원천 보기" }],
      normalizedAnswers: [1],
      explanation: null,
      explanationReference: null,
      images: [],
      validationStatus: "VALID",
      validationErrors: [],
      contentFingerprint: `candidate-fingerprint-${suffix}`,
    },
    generated: {
      id: generatedId,
      candidateQuestionId: candidateId,
      status: "APPROVED",
      contentFingerprint: `generated-fingerprint-${suffix}`,
      similarityWarning: false,
    },
    master: {
      id: masterId,
      generatedQuestionId: generatedId,
      category: "CAT-LAW",
      questionText: `정식 문제 ${suffix}`,
      choices: [
        { index: 1, text: "보기 1" },
        { index: 2, text: "보기 2" },
        { index: 3, text: "보기 3" },
        { index: 4, text: "보기 4" },
      ],
      answers: [2],
      explanation: `해설 ${suffix}`,
      difficulty: "MEDIUM",
      isActive: true,
      publishedAt: new Date("2026-08-30T00:00:00.000Z"),
    },
  };
}

function fixture(): { manifest: VerifiedExactManifest; graphRows: SourceGraphRow[] } {
  const graphRows = Array.from({ length: 80 }, (_, index) => graphRow(index + 1));
  return {
    graphRows,
    manifest: {
      version: "launch-exact-80-manifest-v1",
      checksum: CHECKSUM,
      selectedMasterIds: graphRows.map((row) => row.master.id),
      knownBadMasterIds: ["known_bad_1", "known_bad_2"],
      entries: graphRows.map((row) => ({
        masterQuestionId: row.master.id,
        generatedQuestionId: row.generated.id,
        candidateQuestionId: row.candidate.id,
        category: row.master.category,
        generatedContentFingerprint: row.generated.contentFingerprint as string,
        candidateContentFingerprint: row.candidate.contentFingerprint,
      })),
    },
  };
}

function bundle(exportedAt = new Date("2026-08-31T00:00:00.000Z")): CbtSourceBundleV1 {
  const input = fixture();
  return buildCbtSourceBundleV1({
    ...input,
    exportedAt,
    branch: "codex/s24-launch-validation",
    head: HEAD,
    databaseIdentityFingerprint: "3".repeat(64),
  });
}

const SCHEMA: TargetSchemaInspection = {
  appliedMigrations: ["migration_1"],
  tables: {
    candidate_questions: [
      "id", "sourceName", "sourceQuestionId", "originalUrl", "fetchedAt", "rawHtmlSnippetId",
      "category", "classificationMethod", "questionNumber", "questionText", "choices",
      "normalizedAnswers", "explanation", "explanationReference", "images", "validationStatus",
      "validationErrors", "contentFingerprint",
    ],
    generated_questions: ["id", "candidateQuestionId", "status", "contentFingerprint", "similarityWarning"],
    master_questions: [
      "id", "generatedQuestionId", "category", "questionText", "choices", "answers", "explanation",
      "difficulty", "isActive", "publishedAt",
    ],
  },
  generatedQuestionStatuses: [
    "GENERATED", "QA_PENDING", "QA_PASSED", "QA_FAILED", "HUMAN_REVIEW", "APPROVED", "REJECTED", "FAILED",
  ],
};

function fakeDatabase(input: {
  seedBundle?: CbtSourceBundleV1;
  category?: { id: string; slug: string; isActive: boolean } | null;
  schema?: TargetSchemaInspection;
} = {}): SourceImportDatabase & { writes: number; unrelated: Map<string, string> } {
  const candidates = new Map(input.seedBundle?.candidateQuestions.map((row) => [row.id, structuredClone(row)]) ?? []);
  const generated = new Map(input.seedBundle?.generatedQuestions.map((row) => [row.id, structuredClone(row)]) ?? []);
  const masters = new Map(input.seedBundle?.masterQuestions.map((row) => [row.id, structuredClone(row)]) ?? []);
  const category = input.category === undefined
    ? { id: "category_cargo_driver", slug: "cargo-driver", isActive: true }
    : input.category;
  const unrelated = new Map([["sample-1", "PUBLISHED"]]);
  let writes = 0;

  const database: SourceImportDatabase & { writes: number; unrelated: Map<string, string> } = {
    get writes() { return writes; },
    unrelated,
    async databaseIdentity() {
      return { database: "railway", address: "10.0.0.2", port: 5432, serverVersion: "17.1" };
    },
    async inspectSchema() { return structuredClone(input.schema ?? SCHEMA); },
    async findCategoryBySlug(slug) { return category?.slug === slug ? structuredClone(category) : null; },
    async listCandidateQuestions(ids) { return ids.flatMap((id) => candidates.has(id) ? [structuredClone(candidates.get(id)!)] : []); },
    async listGeneratedQuestions(ids) { return ids.flatMap((id) => generated.has(id) ? [structuredClone(generated.get(id)!)] : []); },
    async listMasterQuestions(ids) { return ids.flatMap((id) => masters.has(id) ? [structuredClone(masters.get(id)!)] : []); },
    async createCandidateQuestion(row) { candidates.set(row.id, structuredClone(row)); writes += 1; },
    async createGeneratedQuestion(row) {
      if (!candidates.has(row.candidateQuestionId)) throw new Error("candidate_fk_missing");
      generated.set(row.id, structuredClone(row)); writes += 1;
    },
    async createMasterQuestion(row) {
      if (!generated.has(row.generatedQuestionId)) throw new Error("generated_fk_missing");
      masters.set(row.id, structuredClone(row)); writes += 1;
    },
    async transaction(work) {
      const snapshots = [structuredClone(candidates), structuredClone(generated), structuredClone(masters)] as const;
      const writeSnapshot = writes;
      try { return await work(database); }
      catch (error) {
        candidates.clear(); for (const [key, value] of snapshots[0]) candidates.set(key, value);
        generated.clear(); for (const [key, value] of snapshots[1]) generated.set(key, value);
        masters.clear(); for (const [key, value] of snapshots[2]) masters.set(key, value);
        writes = writeSnapshot;
        throw error;
      }
    },
    async disconnect() {},
  };
  return database;
}

describe("CBT exact-80 source handoff", () => {
  it("requires the exact manifest checksum and exactly 80 entries", () => {
    const raw = {
      version: "v1", selectionPolicy: "fixed", categoryOrder: ["CAT-LAW"], selectedCount: 80,
      categoryCounts: { "CAT-LAW": 80 }, knownBadMasterIds: [],
      entries: fixture().manifest.entries,
    };
    const expected = checksumCbtSourceJson(exactManifestChecksumPayload(raw));
    expect(() => verifyExact80Manifest({ ...raw, manifestChecksum: expected }, expected)).not.toThrow();
    expect(() => verifyExact80Manifest({ ...raw, manifestChecksum: expected }, "0".repeat(64)))
      .toThrow("cbt_source_manifest_checksum_mismatch");
    expect(() => verifyExact80Manifest({ ...raw, selectedCount: 79, manifestChecksum: expected }, expected))
      .toThrow();
  });

  it("rejects a known-bad Master and a missing dependency", () => {
    const exact = fixture();
    expect(() => buildCbtSourceBundleV1({
      ...exact,
      manifest: { ...exact.manifest, knownBadMasterIds: [exact.graphRows[0].master.id] },
      exportedAt: new Date(), branch: "test", head: HEAD, databaseIdentityFingerprint: "x",
    })).toThrow("cbt_source_known_bad_included");
    expect(() => buildCbtSourceBundleV1({
      ...exact, graphRows: exact.graphRows.slice(1), exportedAt: new Date(), branch: "test", head: HEAD,
      databaseIdentityFingerprint: "x",
    })).toThrow("cbt_source_master_count_invalid");
  });

  it("produces a deterministic checksum independent of exportedAt", () => {
    expect(bundle(new Date("2026-08-31T00:00:00Z")).checksums.bundleChecksum)
      .toBe(bundle(new Date("2026-09-01T00:00:00Z")).checksums.bundleChecksum);
  });

  it("rejects QA_FAILED/FAILED source rows from the exact bundle", () => {
    const exact = fixture();
    exact.graphRows[0].generated.status = "QA_FAILED";
    expect(() => buildCbtSourceBundleV1({
      ...exact, exportedAt: new Date(), branch: "test", head: HEAD, databaseIdentityFingerprint: "x",
    })).toThrow("cbt_source_generated_not_approved");
  });

  it("exports through a read-only repository and repeats the source fingerprint", async () => {
    const exact = fixture();
    let reads = 0;
    const repository: SourceGraphRepository = {
      async databaseIdentity() { return { database: "local", address: "127.0.0.1", port: 5432, serverVersion: "17" }; },
      async listSourceGraph() { reads += 1; return structuredClone(exact.graphRows); },
    };
    const report = await exportCbtSourceBundleV1({
      repository, manifest: exact.manifest, exportedAt: new Date(), branch: "test", head: HEAD,
    });
    expect(report).toMatchObject({ selectedMasterCount: 80, sourceReadBackUnchanged: true, dbWrite: false });
    expect(report.dependencyCounts).toEqual({ CandidateQuestion: 80, GeneratedQuestion: 80, MasterQuestion: 80 });
    expect(reads).toBe(2);
  });

  it("contains only the bounded 80/80/80 graph and excludes sensitive/unrelated data", () => {
    const exactBundle = bundle();
    expect(validateCbtSourceBundleV1(exactBundle)).toEqual({ bundle: exactBundle, errors: [] });
    const serialized = JSON.stringify(exactBundle);
    for (const forbidden of ["rawHtmlSnippetId", "rawLlmResponse", "generatedQuestionQAs", "cbtQuestionActivity", "userId"]) {
      if (forbidden === "generatedQuestionQAs") expect(exactBundle.exclusions.generatedQuestionQAs).toBe(true);
      else expect(serialized).not.toContain(`\"${forbidden}\":`);
    }
  });

  it("verifies the tracked operator artifact identity without exposing content", () => {
    const exactBundle = bundle();
    const firstCandidate = exactBundle.candidateQuestions[0];
    const firstMaster = exactBundle.masterQuestions[0];
    const counts = { "CAT-LAW": 80 };
    const summary = verifyOperatorArtifact(exactBundle, {
      artifactChecksum: exactBundle.checksums.bundleChecksum,
      canonicalVersion: exactBundle.manifest.version,
      categoryCounts: counts,
      excludedSourceQuestionId: "source-excluded",
      includedSourceQuestionId: firstCandidate.sourceQuestionId,
      replacementMasterQuestionId: firstMaster.id,
    });

    expect(summary).toMatchObject({
      artifactChecksum: exactBundle.checksums.bundleChecksum,
      categoryCounts: counts,
      candidateQuestionCount: 80,
      generatedQuestionCount: 80,
      masterQuestionCount: 80,
      excludedSourceQuestionPresent: false,
      includedReplacementSourceQuestionPresent: true,
      replacementMasterQuestionPresent: true,
      dataMinimization: "PASS",
      dbWrite: false,
    });
  });

  it("rejects sensitive paths or credentials even when checksum is recomputed", () => {
    const tampered = structuredClone(bundle()) as CbtSourceBundleV1 & { leak?: string };
    tampered.leak = "postgresql://user:secret@host/db";
    tampered.checksums.bundleChecksum = checksumCbtSourceJson({
      ...tampered,
      exportedAt: undefined,
      checksums: { algorithm: tampered.checksums.algorithm, canonicalization: tampered.checksums.canonicalization },
    });
    expect(validateCbtSourceBundleV1(tampered).errors.join(",")).toContain("database_url");
  });

  it("rejects a checksum-tampered bundle before querying the target", async () => {
    const tampered = bundle();
    tampered.masterQuestions[0].questionText = "tampered";
    const db = fakeDatabase();
    await expect(planCbtSourceImportV1({
      repository: db, bundle: tampered, target: TARGET, expectedMigrationNames: ["migration_1"],
    })).rejects.toThrow("cbt_source_bundle_rejected");
    expect(db.writes).toBe(0);
  });

  it("plans 240 creates with zero writes on an empty compatible staging target", async () => {
    const db = fakeDatabase();
    const plan = await planCbtSourceImportV1({
      repository: db, bundle: bundle(), target: TARGET, expectedMigrationNames: ["migration_1"],
    });
    expect(plan).toMatchObject({
      selectedSourceCount: 80, schemaCompatible: true, eligibleForImport: true, dbWrite: false,
      wouldCreate: { CandidateQuestion: 80, GeneratedQuestion: 80, MasterQuestion: 80 },
      conflicts: { CandidateQuestion: 0, GeneratedQuestion: 0, MasterQuestion: 0 }, invalid: [],
    });
    expect(db.writes).toBe(0);
  });

  it("classifies identical rows as NO_OP and is deterministic on rerun", async () => {
    const exactBundle = bundle();
    const db = fakeDatabase({ seedBundle: exactBundle });
    const first = await planCbtSourceImportV1({ repository: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"] });
    const second = await planCbtSourceImportV1({ repository: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"] });
    expect(first.wouldNoOp).toEqual({ CandidateQuestion: 80, GeneratedQuestion: 80, MasterQuestion: 80 });
    expect(first.planChecksum).toBe(second.planChecksum);
    expect(db.writes).toBe(0);
  });

  it("stops on incompatible identity content", async () => {
    const exactBundle = bundle();
    const db = fakeDatabase({ seedBundle: exactBundle });
    const conflicting = structuredClone(exactBundle);
    conflicting.candidateQuestions[0].questionText = "incompatible";
    conflicting.checksums.bundleChecksum = checksumCbtSourceJson({
      format: conflicting.format, schemaVersion: conflicting.schemaVersion, source: conflicting.source,
      manifest: conflicting.manifest, categoryRequirement: conflicting.categoryRequirement,
      candidateQuestions: conflicting.candidateQuestions, generatedQuestions: conflicting.generatedQuestions,
      masterQuestions: conflicting.masterQuestions, exclusions: conflicting.exclusions, summary: conflicting.summary,
      checksums: { algorithm: conflicting.checksums.algorithm, canonicalization: conflicting.checksums.canonicalization },
    });
    const plan = await planCbtSourceImportV1({ repository: db, bundle: conflicting, target: TARGET, expectedMigrationNames: ["migration_1"] });
    expect(plan.conflicts.CandidateQuestion).toBe(1);
    expect(plan.eligibleForImport).toBe(false);
    expect(db.writes).toBe(0);
  });

  it("checks category and schema/migration prerequisites", async () => {
    const missingCategory = fakeDatabase({ category: null });
    const categoryPlan = await planCbtSourceImportV1({ repository: missingCategory, bundle: bundle(), target: TARGET, expectedMigrationNames: ["migration_1"] });
    expect(categoryPlan.invalid).toContain("category_missing:cargo-driver");
    const badSchema = structuredClone(SCHEMA);
    badSchema.tables.master_questions = badSchema.tables.master_questions.filter((column) => column !== "publishedAt");
    const schemaPlan = await planCbtSourceImportV1({ repository: fakeDatabase({ schema: badSchema }), bundle: bundle(), target: TARGET, expectedMigrationNames: ["migration_1", "missing"] });
    expect(schemaPlan.schemaCompatible).toBe(false);
    expect(schemaPlan.missingMigrations).toEqual(["missing"]);
  });

  it("rejects Production and non-tunneled target contracts", () => {
    expect(() => assertStagingTargetBoundary({
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:55432/db", CBT_HANDOFF_PROJECT: "gto-site1-production",
      CBT_HANDOFF_ENVIRONMENT: "production", CBT_HANDOFF_SERVICE: "gto-web", CBT_HANDOFF_PRODUCTION_EMPTY: "true",
    })).toThrow("cbt_source_production_target_forbidden");
    expect(() => assertStagingTargetBoundary({
      DATABASE_URL: "postgresql://user:pass@remote.example:5432/db", CBT_HANDOFF_PROJECT: "gto-site1-production",
      CBT_HANDOFF_ENVIRONMENT: "staging", CBT_HANDOFF_SERVICE: "gto-web", CBT_HANDOFF_PRODUCTION_EMPTY: "true",
    })).toThrow("cbt_source_staging_database_must_use_local_tunnel");
  });

  it("requires explicit approval and plan checksum before a bounded transaction", async () => {
    const exactBundle = bundle();
    const db = fakeDatabase();
    const plan = await planCbtSourceImportV1({ repository: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"] });
    await expect(executeCbtSourceImportV1({
      database: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"],
      expectedPlanChecksum: plan.planChecksum, approval: "not approved",
    })).rejects.toThrow("cbt_source_import_approval_required");
    expect(db.writes).toBe(0);
  });

  it("imports in FK order, verifies read-back, reruns as NO_OP, and leaves sample data untouched", async () => {
    const exactBundle = bundle();
    const db = fakeDatabase();
    const plan = await planCbtSourceImportV1({ repository: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"] });
    const result = await executeCbtSourceImportV1({
      database: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"],
      expectedPlanChecksum: plan.planChecksum, approval: CBT_SOURCE_IMPORT_APPROVAL,
    });
    expect(result.created).toEqual({ CandidateQuestion: 80, GeneratedQuestion: 80, MasterQuestion: 80 });
    expect(result.postCommitVerified).toBe(true);
    expect(db.unrelated.get("sample-1")).toBe("PUBLISHED");
    const rerun = await planCbtSourceImportV1({ repository: db, bundle: exactBundle, target: TARGET, expectedMigrationNames: ["migration_1"] });
    expect(rerun.wouldNoOp).toEqual({ CandidateQuestion: 80, GeneratedQuestion: 80, MasterQuestion: 80 });
    expect(rerun.wouldCreate).toEqual({ CandidateQuestion: 0, GeneratedQuestion: 0, MasterQuestion: 0 });
  });
});
