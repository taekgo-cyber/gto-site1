import { createHash } from "node:crypto";
import {
  CBT_EXACT_80_COUNT,
  CBT_EXACT_80_MANIFEST_CHECKSUM,
  CBT_SOURCE_BUNDLE_CANONICALIZATION,
  CBT_SOURCE_BUNDLE_CHECKSUM_ALGORITHM,
  CBT_SOURCE_BUNDLE_FORMAT,
  CBT_SOURCE_BUNDLE_VERSION,
  CBT_SOURCE_CATEGORY_SLUG,
  type CbtSourceBundleV1,
  type ExactManifestEntry,
  type JsonValue,
  type SourceGraphRow,
  type VerifiedExactManifest,
} from "./types";

export function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("cbt_source_json_number_invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, normalizeJson(entry)]),
    );
  }
  throw new Error("cbt_source_json_invalid");
}

export function stableCbtSourceJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function checksumCbtSourceJson(value: unknown): string {
  return createHash("sha256").update(stableCbtSourceJson(value)).digest("hex");
}

export function exactManifestChecksumPayload(manifest: {
  version: unknown;
  selectionPolicy: unknown;
  categoryOrder: unknown;
  selectedCount: unknown;
  categoryCounts: unknown;
  knownBadMasterIds: unknown;
  entries: unknown;
}): object {
  return {
    version: manifest.version,
    selectionPolicy: manifest.selectionPolicy,
    categoryOrder: manifest.categoryOrder,
    selectedCount: manifest.selectedCount,
    categoryCounts: manifest.categoryCounts,
    knownBadMasterIds: manifest.knownBadMasterIds,
    entries: manifest.entries,
  };
}

function requiredString(value: unknown, error: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(error);
  return value;
}

export function verifyExact80Manifest(
  value: unknown,
  expectedChecksum: string,
): VerifiedExactManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("cbt_source_manifest_invalid");
  }
  const manifest = value as Record<string, unknown>;
  const checksum = requiredString(manifest.manifestChecksum, "cbt_source_manifest_checksum_missing");
  if (checksum !== expectedChecksum) throw new Error("cbt_source_manifest_checksum_mismatch");
  if (checksumCbtSourceJson(exactManifestChecksumPayload(manifest as never)) !== expectedChecksum) {
    throw new Error("cbt_source_manifest_recomputed_checksum_mismatch");
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== CBT_EXACT_80_COUNT) {
    throw new Error("cbt_source_manifest_selected_count_invalid");
  }
  if (manifest.selectedCount !== CBT_EXACT_80_COUNT) {
    throw new Error("cbt_source_manifest_selected_count_invalid");
  }
  const entries = manifest.entries.map((entry, index): ExactManifestEntry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`cbt_source_manifest_entry_invalid:${index}`);
    }
    const row = entry as Record<string, unknown>;
    return {
      masterQuestionId: requiredString(row.masterQuestionId, "cbt_source_manifest_master_id_missing"),
      generatedQuestionId: requiredString(row.generatedQuestionId, "cbt_source_manifest_generated_id_missing"),
      candidateQuestionId: requiredString(row.candidateQuestionId, "cbt_source_manifest_candidate_id_missing"),
      category: requiredString(row.category, "cbt_source_manifest_category_missing"),
      generatedContentFingerprint: requiredString(
        row.generatedContentFingerprint,
        "cbt_source_manifest_generated_fingerprint_missing",
      ),
      candidateContentFingerprint: requiredString(
        row.candidateContentFingerprint,
        "cbt_source_manifest_candidate_fingerprint_missing",
      ),
    };
  });
  const selectedMasterIds = entries.map((entry) => entry.masterQuestionId);
  if (new Set(selectedMasterIds).size !== CBT_EXACT_80_COUNT) {
    throw new Error("cbt_source_manifest_master_ids_duplicate");
  }
  const knownBadMasterIds = Array.isArray(manifest.knownBadMasterIds)
    ? manifest.knownBadMasterIds.map((id) => requiredString(id, "cbt_source_manifest_known_bad_invalid"))
    : [];
  if (knownBadMasterIds.some((id) => selectedMasterIds.includes(id))) {
    throw new Error("cbt_source_manifest_known_bad_selected");
  }
  return {
    version: requiredString(manifest.version, "cbt_source_manifest_version_missing"),
    checksum,
    selectedMasterIds,
    knownBadMasterIds,
    entries,
  };
}

function isoDate(value: Date | null, error: string): string | null {
  if (value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(error);
  return value.toISOString();
}

function canonicalGraphRows(rows: SourceGraphRow[]) {
  const sorted = [...rows].sort((left, right) => left.master.id.localeCompare(right.master.id, "en"));
  return {
    candidateQuestions: sorted
      .map(({ candidate }) => ({
        ...candidate,
        fetchedAt: isoDate(candidate.fetchedAt, "cbt_source_candidate_fetched_at_invalid"),
        choices: normalizeJson(candidate.choices),
        normalizedAnswers: normalizeJson(candidate.normalizedAnswers),
        explanationReference: normalizeJson(candidate.explanationReference),
        images: normalizeJson(candidate.images),
        validationErrors: normalizeJson(candidate.validationErrors),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, "en")),
    generatedQuestions: sorted
      .map(({ generated }) => ({ ...generated }))
      .sort((left, right) => left.id.localeCompare(right.id, "en")),
    masterQuestions: sorted
      .map(({ master }) => ({
        ...master,
        publishedAt: isoDate(master.publishedAt, "cbt_source_master_published_at_invalid"),
        choices: normalizeJson(master.choices),
        answers: normalizeJson(master.answers),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, "en")),
  };
}

export function bundleChecksumPayload(bundle: CbtSourceBundleV1): object {
  return {
    format: bundle.format,
    schemaVersion: bundle.schemaVersion,
    source: bundle.source,
    manifest: bundle.manifest,
    categoryRequirement: bundle.categoryRequirement,
    candidateQuestions: bundle.candidateQuestions,
    generatedQuestions: bundle.generatedQuestions,
    masterQuestions: bundle.masterQuestions,
    exclusions: bundle.exclusions,
    summary: bundle.summary,
    checksums: {
      algorithm: bundle.checksums.algorithm,
      canonicalization: bundle.checksums.canonicalization,
    },
  };
}

export function buildCbtSourceBundleV1(input: {
  manifest: VerifiedExactManifest;
  graphRows: SourceGraphRow[];
  exportedAt: Date;
  branch: string;
  head: string;
  databaseIdentityFingerprint: string;
}): CbtSourceBundleV1 {
  if (input.manifest.checksum !== CBT_EXACT_80_MANIFEST_CHECKSUM) {
    throw new Error("cbt_source_manifest_checksum_invalid");
  }
  if (input.graphRows.length !== CBT_EXACT_80_COUNT) throw new Error("cbt_source_master_count_invalid");
  if (!(input.exportedAt instanceof Date) || Number.isNaN(input.exportedAt.getTime())) {
    throw new Error("cbt_source_exported_at_invalid");
  }
  if (!/^[0-9a-f]{40}$/i.test(input.head)) throw new Error("cbt_source_head_invalid");

  const byMasterId = new Map(input.graphRows.map((row) => [row.master.id, row]));
  if (byMasterId.size !== CBT_EXACT_80_COUNT) throw new Error("cbt_source_master_identity_duplicate");
  const ordered = input.manifest.selectedMasterIds.map((id) => byMasterId.get(id));
  if (ordered.some((row) => !row)) throw new Error("cbt_source_master_dependency_missing");
  const graphRows = ordered as SourceGraphRow[];

  for (const [index, row] of graphRows.entries()) {
    const expected = input.manifest.entries[index];
    if (
      row.master.id !== expected.masterQuestionId ||
      row.master.generatedQuestionId !== expected.generatedQuestionId ||
      row.generated.id !== expected.generatedQuestionId ||
      row.generated.candidateQuestionId !== expected.candidateQuestionId ||
      row.candidate.id !== expected.candidateQuestionId
    ) {
      throw new Error(`cbt_source_dependency_identity_mismatch:${row.master.id}`);
    }
    if (row.master.category !== expected.category) {
      throw new Error(`cbt_source_category_mismatch:${row.master.id}`);
    }
    if (row.generated.status !== "APPROVED") {
      throw new Error(`cbt_source_generated_not_approved:${row.generated.id}`);
    }
    if (row.generated.contentFingerprint !== expected.generatedContentFingerprint) {
      throw new Error(`cbt_source_generated_fingerprint_mismatch:${row.generated.id}`);
    }
    if (row.candidate.contentFingerprint !== expected.candidateContentFingerprint) {
      throw new Error(`cbt_source_candidate_fingerprint_mismatch:${row.candidate.id}`);
    }
    if (!row.master.isActive || row.master.publishedAt === null) {
      throw new Error(`cbt_source_master_not_publishable:${row.master.id}`);
    }
    if (row.candidate.validationStatus !== "VALID") {
      throw new Error(`cbt_source_candidate_not_valid:${row.candidate.id}`);
    }
  }

  const canonical = canonicalGraphRows(graphRows);
  if (
    new Set(canonical.candidateQuestions.map((row) => row.id)).size !== CBT_EXACT_80_COUNT ||
    new Set(canonical.generatedQuestions.map((row) => row.id)).size !== CBT_EXACT_80_COUNT
  ) {
    throw new Error("cbt_source_dependency_identity_duplicate");
  }
  const knownBadIncludedCount = input.manifest.knownBadMasterIds.filter((id) => byMasterId.has(id)).length;
  if (knownBadIncludedCount !== 0) throw new Error("cbt_source_known_bad_included");

  const bundle: CbtSourceBundleV1 = {
    format: CBT_SOURCE_BUNDLE_FORMAT,
    schemaVersion: CBT_SOURCE_BUNDLE_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    source: {
      environment: "local",
      branch: input.branch,
      head: input.head.toLowerCase(),
      databaseIdentityFingerprint: input.databaseIdentityFingerprint,
      exporterVersion: "1",
    },
    manifest: {
      version: input.manifest.version,
      checksum: input.manifest.checksum,
      selectedMasterIds: [...input.manifest.selectedMasterIds],
      knownBadMasterIds: [...input.manifest.knownBadMasterIds].sort((a, b) => a.localeCompare(b, "en")),
    },
    categoryRequirement: { slug: CBT_SOURCE_CATEGORY_SLUG, mustExist: true, mustBeActive: true },
    ...canonical,
    exclusions: {
      generatedQuestionQAs: true,
      candidateReviews: true,
      duplicateAndHistoryRows: true,
      rawHtmlAndLlmPayloads: true,
      cbtQuestionsAndSamples: true,
      usersAuthActivityAndExamRecords: true,
    },
    checksums: {
      algorithm: CBT_SOURCE_BUNDLE_CHECKSUM_ALGORITHM,
      canonicalization: CBT_SOURCE_BUNDLE_CANONICALIZATION,
      bundleChecksum: "",
    },
    summary: {
      selectedMasterCount: canonical.masterQuestions.length,
      candidateQuestionCount: canonical.candidateQuestions.length,
      generatedQuestionCount: canonical.generatedQuestions.length,
      masterQuestionCount: canonical.masterQuestions.length,
      knownBadIncludedCount,
      sensitiveDataIncluded: false,
    },
  };
  bundle.checksums.bundleChecksum = checksumCbtSourceJson(bundleChecksumPayload(bundle));
  return bundle;
}

const FORBIDDEN_KEYS = new Set([
  "rawHtmlSnippetId",
  "rawHtml",
  "rawLlmResponse",
  "userId",
  "email",
  "phone",
  "password",
  "session",
  "auth",
]);

function scanSensitive(value: unknown, path = "bundle"): string[] {
  if (typeof value === "string") {
    if (/file:\/\//i.test(value) || /[a-z]:\\users\\/i.test(value)) return [`${path}:local_path`];
    if (/postgres(?:ql)?:\/\//i.test(value)) return [`${path}:database_url`];
    return [];
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => scanSensitive(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
    ...(FORBIDDEN_KEYS.has(key) ? [`${path}.${key}:forbidden_key`] : []),
    ...scanSensitive(entry, `${path}.${key}`),
  ]);
}

export function validateCbtSourceBundleV1(value: unknown): {
  bundle?: CbtSourceBundleV1;
  errors: string[];
} {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: ["cbt_source_bundle_invalid"] };
  }
  const bundle = value as CbtSourceBundleV1;
  if (bundle.format !== CBT_SOURCE_BUNDLE_FORMAT) errors.push("cbt_source_bundle_format_invalid");
  if (bundle.schemaVersion !== CBT_SOURCE_BUNDLE_VERSION) errors.push("cbt_source_bundle_version_invalid");
  if (bundle.manifest?.checksum !== CBT_EXACT_80_MANIFEST_CHECKSUM) {
    errors.push("cbt_source_bundle_manifest_checksum_invalid");
  }
  if (bundle.manifest?.selectedMasterIds?.length !== CBT_EXACT_80_COUNT) {
    errors.push("cbt_source_bundle_selected_count_invalid");
  }
  for (const [name, rows] of [
    ["candidate", bundle.candidateQuestions],
    ["generated", bundle.generatedQuestions],
    ["master", bundle.masterQuestions],
  ] as const) {
    if (!Array.isArray(rows) || rows.length !== CBT_EXACT_80_COUNT) {
      errors.push(`cbt_source_bundle_${name}_count_invalid`);
    } else if (new Set(rows.map((row) => row.id)).size !== CBT_EXACT_80_COUNT) {
      errors.push(`cbt_source_bundle_${name}_identity_duplicate`);
    }
  }
  if (bundle.summary?.knownBadIncludedCount !== 0) errors.push("cbt_source_bundle_known_bad_included");
  if (bundle.summary?.sensitiveDataIncluded !== false) errors.push("cbt_source_bundle_sensitive_flag_invalid");
  if (
    bundle.categoryRequirement?.slug !== CBT_SOURCE_CATEGORY_SLUG ||
    bundle.categoryRequirement?.mustExist !== true ||
    bundle.categoryRequirement?.mustBeActive !== true
  ) {
    errors.push("cbt_source_bundle_category_contract_invalid");
  }
  if (Array.isArray(bundle.masterQuestions) && Array.isArray(bundle.manifest?.selectedMasterIds)) {
    const selected = new Set(bundle.manifest.selectedMasterIds);
    const masterIds = new Set(bundle.masterQuestions.map((row) => row.id));
    if (
      selected.size !== CBT_EXACT_80_COUNT ||
      masterIds.size !== CBT_EXACT_80_COUNT ||
      [...selected].some((id) => !masterIds.has(id))
    ) {
      errors.push("cbt_source_bundle_selection_scope_invalid");
    }
    if (bundle.manifest.knownBadMasterIds.some((id) => selected.has(id))) {
      errors.push("cbt_source_bundle_known_bad_selected");
    }
  }
  if (
    Array.isArray(bundle.candidateQuestions) &&
    Array.isArray(bundle.generatedQuestions) &&
    Array.isArray(bundle.masterQuestions)
  ) {
    const candidateById = new Map(bundle.candidateQuestions.map((row) => [row.id, row]));
    const generatedById = new Map(bundle.generatedQuestions.map((row) => [row.id, row]));
    for (const generated of bundle.generatedQuestions) {
      if (!candidateById.has(generated.candidateQuestionId)) {
        errors.push(`cbt_source_bundle_candidate_dependency_missing:${generated.id}`);
      }
      if (generated.status !== "APPROVED" || !generated.contentFingerprint) {
        errors.push(`cbt_source_bundle_generated_not_publishable:${generated.id}`);
      }
    }
    for (const candidate of bundle.candidateQuestions) {
      if (candidate.validationStatus !== "VALID" || candidate.contentFingerprint.trim() === "") {
        errors.push(`cbt_source_bundle_candidate_not_valid:${candidate.id}`);
      }
    }
    for (const master of bundle.masterQuestions) {
      if (!generatedById.has(master.generatedQuestionId)) {
        errors.push(`cbt_source_bundle_generated_dependency_missing:${master.id}`);
      }
      if (!master.isActive || !master.publishedAt) {
        errors.push(`cbt_source_bundle_master_not_publishable:${master.id}`);
      }
    }
  }
  if (
    bundle.summary?.selectedMasterCount !== CBT_EXACT_80_COUNT ||
    bundle.summary?.candidateQuestionCount !== bundle.candidateQuestions?.length ||
    bundle.summary?.generatedQuestionCount !== bundle.generatedQuestions?.length ||
    bundle.summary?.masterQuestionCount !== bundle.masterQuestions?.length
  ) {
    errors.push("cbt_source_bundle_summary_invalid");
  }
  errors.push(...scanSensitive(bundle));
  try {
    if (checksumCbtSourceJson(bundleChecksumPayload(bundle)) !== bundle.checksums?.bundleChecksum) {
      errors.push("cbt_source_bundle_checksum_invalid");
    }
  } catch {
    errors.push("cbt_source_bundle_checksum_invalid");
  }
  return errors.length === 0 ? { bundle, errors } : { errors: [...new Set(errors)].sort() };
}

export function serializeCbtSourceBundleV1(bundle: CbtSourceBundleV1): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
