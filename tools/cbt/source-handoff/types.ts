export const CBT_SOURCE_BUNDLE_FORMAT = "gto.cbt-exact-source";
export const CBT_SOURCE_BUNDLE_VERSION = 1;
export const CBT_SOURCE_BUNDLE_CANONICALIZATION = "gto-stable-json-v1";
export const CBT_SOURCE_BUNDLE_CHECKSUM_ALGORITHM = "sha256";
export const CBT_EXACT_80_MANIFEST_CHECKSUM =
  "1979a83ca20db5423599a48224571765bbd65c9fd1edd9b5e9948198c4944f07";
export const CBT_EXACT_80_COUNT = 80;
export const CBT_SOURCE_CATEGORY_SLUG = "cargo-driver";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ExactManifestEntry = {
  masterQuestionId: string;
  generatedQuestionId: string;
  candidateQuestionId: string;
  category: string;
  generatedContentFingerprint: string;
  candidateContentFingerprint: string;
};

export type VerifiedExactManifest = {
  version: string;
  checksum: string;
  selectedMasterIds: string[];
  knownBadMasterIds: string[];
  entries: ExactManifestEntry[];
};

export type CandidateQuestionBundleRow = {
  id: string;
  sourceName: string;
  sourceQuestionId: string;
  originalUrl: string | null;
  fetchedAt: string | null;
  category: string;
  classificationMethod: string;
  questionNumber: number | null;
  questionText: string;
  choices: JsonValue;
  normalizedAnswers: JsonValue;
  explanation: string | null;
  explanationReference: JsonValue;
  images: JsonValue;
  validationStatus: "VALID" | "REVIEW_REQUIRED" | "REJECTED";
  validationErrors: JsonValue;
  contentFingerprint: string;
};

export type GeneratedQuestionBundleRow = {
  id: string;
  candidateQuestionId: string;
  status:
    | "GENERATED"
    | "QA_PENDING"
    | "QA_PASSED"
    | "QA_FAILED"
    | "HUMAN_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "FAILED";
  contentFingerprint: string | null;
  similarityWarning: boolean;
};

export type MasterQuestionBundleRow = {
  id: string;
  generatedQuestionId: string;
  category: string;
  questionText: string;
  choices: JsonValue;
  answers: JsonValue;
  explanation: string | null;
  difficulty: string;
  isActive: boolean;
  publishedAt: string | null;
};

export type CbtSourceBundleV1 = {
  format: typeof CBT_SOURCE_BUNDLE_FORMAT;
  schemaVersion: typeof CBT_SOURCE_BUNDLE_VERSION;
  exportedAt: string;
  source: {
    environment: "local";
    branch: string;
    head: string;
    databaseIdentityFingerprint: string;
    exporterVersion: "1";
  };
  manifest: {
    version: string;
    checksum: string;
    selectedMasterIds: string[];
    knownBadMasterIds: string[];
  };
  categoryRequirement: {
    slug: typeof CBT_SOURCE_CATEGORY_SLUG;
    mustExist: true;
    mustBeActive: true;
  };
  candidateQuestions: CandidateQuestionBundleRow[];
  generatedQuestions: GeneratedQuestionBundleRow[];
  masterQuestions: MasterQuestionBundleRow[];
  exclusions: {
    generatedQuestionQAs: true;
    candidateReviews: true;
    duplicateAndHistoryRows: true;
    rawHtmlAndLlmPayloads: true;
    cbtQuestionsAndSamples: true;
    usersAuthActivityAndExamRecords: true;
  };
  checksums: {
    algorithm: typeof CBT_SOURCE_BUNDLE_CHECKSUM_ALGORITHM;
    canonicalization: typeof CBT_SOURCE_BUNDLE_CANONICALIZATION;
    bundleChecksum: string;
  };
  summary: {
    selectedMasterCount: number;
    candidateQuestionCount: number;
    generatedQuestionCount: number;
    masterQuestionCount: number;
    knownBadIncludedCount: number;
    sensitiveDataIncluded: false;
  };
};

export type SourceGraphRow = {
  master: Omit<MasterQuestionBundleRow, "publishedAt"> & { publishedAt: Date | null };
  generated: GeneratedQuestionBundleRow;
  candidate: Omit<CandidateQuestionBundleRow, "fetchedAt"> & { fetchedAt: Date | null };
};

export type SourceGraphRepository = {
  listSourceGraph(masterIds: readonly string[]): Promise<SourceGraphRow[]>;
  databaseIdentity(): Promise<{
    database: string;
    address: string | null;
    port: number | null;
    serverVersion: string;
  }>;
};

export type ImportAction = "CREATE" | "NO_OP" | "CONFLICT";
export type ImportTableName = "CandidateQuestion" | "GeneratedQuestion" | "MasterQuestion";

export type ImportDecision = {
  id: string;
  action: ImportAction;
  reasons: string[];
};

export type TargetIdentity = {
  project: string;
  environment: "staging";
  service: string;
  database: string;
  address: string | null;
  port: number | null;
  serverVersion: string;
  databaseIdentityFingerprint: string;
  routedViaLocalTunnel: true;
};

export type TargetSchemaInspection = {
  appliedMigrations: string[];
  tables: Record<string, string[]>;
  generatedQuestionStatuses: string[];
};

export type SourceImportRepository = {
  databaseIdentity(): SourceGraphRepository["databaseIdentity"] extends (...args: never[]) => infer R ? R : never;
  inspectSchema(): Promise<TargetSchemaInspection>;
  findCategoryBySlug(slug: string): Promise<{ id: string; slug: string; isActive: boolean } | null>;
  listCandidateQuestions(ids: readonly string[]): Promise<CandidateQuestionBundleRow[]>;
  listGeneratedQuestions(ids: readonly string[]): Promise<GeneratedQuestionBundleRow[]>;
  listMasterQuestions(ids: readonly string[]): Promise<MasterQuestionBundleRow[]>;
};

export type SourceImportDatabase = SourceImportRepository & {
  createCandidateQuestion(row: CandidateQuestionBundleRow): Promise<void>;
  createGeneratedQuestion(row: GeneratedQuestionBundleRow): Promise<void>;
  createMasterQuestion(row: MasterQuestionBundleRow): Promise<void>;
  transaction<T>(work: (repository: SourceImportDatabase) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
};

export type SourceImportPlan = {
  planChecksum: string;
  bundleChecksum: string;
  selectedSourceCount: number;
  targetIdentity: TargetIdentity;
  schemaCompatible: boolean;
  missingMigrations: string[];
  category: { slug: string; present: boolean; active: boolean };
  tables: Record<ImportTableName, ImportDecision[]>;
  wouldCreate: Record<ImportTableName, number>;
  wouldNoOp: Record<ImportTableName, number>;
  conflicts: Record<ImportTableName, number>;
  invalid: string[];
  eligibleForImport: boolean;
  dbWrite: false;
};
