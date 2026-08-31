import { checksumCbtSourceJson, stableCbtSourceJson, validateCbtSourceBundleV1 } from "./bundle-v1";
import {
  CBT_SOURCE_CATEGORY_SLUG,
  type CbtSourceBundleV1,
  type ImportDecision,
  type ImportTableName,
  type SourceImportPlan,
  type SourceImportRepository,
  type TargetIdentity,
} from "./types";

const REQUIRED_COLUMNS: Record<string, string[]> = {
  candidate_questions: [
    "id",
    "sourceName",
    "sourceQuestionId",
    "originalUrl",
    "fetchedAt",
    "rawHtmlSnippetId",
    "category",
    "classificationMethod",
    "questionNumber",
    "questionText",
    "choices",
    "normalizedAnswers",
    "explanation",
    "explanationReference",
    "images",
    "validationStatus",
    "validationErrors",
    "contentFingerprint",
  ],
  generated_questions: [
    "id",
    "candidateQuestionId",
    "status",
    "contentFingerprint",
    "similarityWarning",
  ],
  master_questions: [
    "id",
    "generatedQuestionId",
    "category",
    "questionText",
    "choices",
    "answers",
    "explanation",
    "difficulty",
    "isActive",
    "publishedAt",
  ],
};

const REQUIRED_GENERATED_STATUSES = [
  "GENERATED",
  "QA_PENDING",
  "QA_PASSED",
  "QA_FAILED",
  "HUMAN_REVIEW",
  "APPROVED",
  "REJECTED",
  "FAILED",
];

function decisions<T extends { id: string }>(expected: T[], actual: T[]): ImportDecision[] {
  const actualById = new Map(actual.map((row) => [row.id, row]));
  return expected.map((row) => {
    const target = actualById.get(row.id);
    if (!target) return { id: row.id, action: "CREATE" as const, reasons: [] };
    if (stableCbtSourceJson(target) === stableCbtSourceJson(row)) {
      return { id: row.id, action: "NO_OP" as const, reasons: [] };
    }
    return { id: row.id, action: "CONFLICT" as const, reasons: ["canonical_content_mismatch"] };
  });
}

function tableCounts(
  tables: Record<ImportTableName, ImportDecision[]>,
  action: ImportDecision["action"],
): Record<ImportTableName, number> {
  return {
    CandidateQuestion: tables.CandidateQuestion.filter((item) => item.action === action).length,
    GeneratedQuestion: tables.GeneratedQuestion.filter((item) => item.action === action).length,
    MasterQuestion: tables.MasterQuestion.filter((item) => item.action === action).length,
  };
}

export async function planCbtSourceImportV1(input: {
  repository: SourceImportRepository;
  bundle: unknown;
  target: Omit<
    TargetIdentity,
    "database" | "address" | "port" | "serverVersion" | "databaseIdentityFingerprint" | "routedViaLocalTunnel"
  >;
  expectedMigrationNames: readonly string[];
}): Promise<SourceImportPlan> {
  const validation = validateCbtSourceBundleV1(input.bundle);
  if (!validation.bundle) throw new Error(`cbt_source_bundle_rejected:${validation.errors.join(",")}`);
  const bundle = validation.bundle;
  const [identity, schema, category, candidates, generated, masters] = await Promise.all([
    input.repository.databaseIdentity(),
    input.repository.inspectSchema(),
    input.repository.findCategoryBySlug(CBT_SOURCE_CATEGORY_SLUG),
    input.repository.listCandidateQuestions(bundle.candidateQuestions.map((row) => row.id)),
    input.repository.listGeneratedQuestions(bundle.generatedQuestions.map((row) => row.id)),
    input.repository.listMasterQuestions(bundle.masterQuestions.map((row) => row.id)),
  ]);
  const targetIdentity: TargetIdentity = {
    ...input.target,
    ...identity,
    databaseIdentityFingerprint: checksumCbtSourceJson({ ...input.target, ...identity }),
    routedViaLocalTunnel: true,
  };
  const missingMigrations = input.expectedMigrationNames.filter(
    (migration) => !schema.appliedMigrations.includes(migration),
  );
  const invalid: string[] = [];
  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const actualColumns = schema.tables[table] ?? [];
    for (const column of requiredColumns) {
      if (!actualColumns.includes(column)) invalid.push(`schema_column_missing:${table}.${column}`);
    }
  }
  for (const status of REQUIRED_GENERATED_STATUSES) {
    if (!schema.generatedQuestionStatuses.includes(status)) invalid.push(`schema_enum_missing:${status}`);
  }
  if (missingMigrations.length > 0) invalid.push("schema_migrations_missing");
  if (!category) invalid.push(`category_missing:${CBT_SOURCE_CATEGORY_SLUG}`);
  else if (!category.isActive) invalid.push(`category_inactive:${CBT_SOURCE_CATEGORY_SLUG}`);

  const tables = {
    CandidateQuestion: decisions(bundle.candidateQuestions, candidates),
    GeneratedQuestion: decisions(bundle.generatedQuestions, generated),
    MasterQuestion: decisions(bundle.masterQuestions, masters),
  } satisfies Record<ImportTableName, ImportDecision[]>;
  const wouldCreate = tableCounts(tables, "CREATE");
  const wouldNoOp = tableCounts(tables, "NO_OP");
  const conflicts = tableCounts(tables, "CONFLICT");
  const schemaCompatible = invalid.every((reason) => !reason.startsWith("schema_"));
  const eligibleForImport =
    invalid.length === 0 && Object.values(conflicts).every((count) => count === 0);
  const planWithoutChecksum = {
    bundleChecksum: bundle.checksums.bundleChecksum,
    selectedSourceCount: bundle.masterQuestions.length,
    targetIdentity,
    schemaCompatible,
    missingMigrations: [...missingMigrations].sort((a, b) => a.localeCompare(b, "en")),
    category: {
      slug: CBT_SOURCE_CATEGORY_SLUG,
      present: category !== null,
      active: category?.isActive === true,
    },
    tables,
    wouldCreate,
    wouldNoOp,
    conflicts,
    invalid: [...invalid].sort((a, b) => a.localeCompare(b, "en")),
    eligibleForImport,
    dbWrite: false as const,
  };
  return { planChecksum: checksumCbtSourceJson(planWithoutChecksum), ...planWithoutChecksum };
}

export function sourceBundleForPlan(plan: SourceImportPlan, bundle: unknown): CbtSourceBundleV1 {
  const validation = validateCbtSourceBundleV1(bundle);
  if (!validation.bundle || validation.bundle.checksums.bundleChecksum !== plan.bundleChecksum) {
    throw new Error("cbt_source_plan_bundle_mismatch");
  }
  return validation.bundle;
}
