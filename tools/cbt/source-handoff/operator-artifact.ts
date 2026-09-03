import { validateCbtSourceBundleV1 } from "./bundle-v1";
import {
  CBT_EXACT_80_ARTIFACT_CHECKSUM,
  CBT_EXACT_80_CANONICAL_VERSION,
  CBT_EXACT_80_CATEGORY_COUNTS,
  CBT_EXACT_80_EXCLUDED_SOURCE_QUESTION_ID,
  CBT_EXACT_80_INCLUDED_REPLACEMENT_SOURCE_QUESTION_ID,
  CBT_EXACT_80_REPLACEMENT_MASTER_QUESTION_ID,
  type CbtSourceBundleV1,
} from "./types";

export type OperatorArtifactContract = {
  artifactChecksum: string;
  canonicalVersion: string;
  categoryCounts: Readonly<Record<string, number>>;
  excludedSourceQuestionId: string;
  includedSourceQuestionId: string;
  replacementMasterQuestionId: string;
};

export const CBT_EXACT_80_OPERATOR_ARTIFACT_CONTRACT: OperatorArtifactContract = {
  artifactChecksum: CBT_EXACT_80_ARTIFACT_CHECKSUM,
  canonicalVersion: CBT_EXACT_80_CANONICAL_VERSION,
  categoryCounts: CBT_EXACT_80_CATEGORY_COUNTS,
  excludedSourceQuestionId: CBT_EXACT_80_EXCLUDED_SOURCE_QUESTION_ID,
  includedSourceQuestionId: CBT_EXACT_80_INCLUDED_REPLACEMENT_SOURCE_QUESTION_ID,
  replacementMasterQuestionId: CBT_EXACT_80_REPLACEMENT_MASTER_QUESTION_ID,
};

export type OperatorArtifactSummary = {
  canonicalVersion: string;
  semanticChecksum: string;
  artifactChecksum: string;
  categoryCounts: Record<string, number>;
  candidateQuestionCount: number;
  generatedQuestionCount: number;
  masterQuestionCount: number;
  excludedSourceQuestionPresent: false;
  includedReplacementSourceQuestionPresent: true;
  replacementMasterQuestionPresent: true;
  dataMinimization: "PASS";
  dbWrite: false;
};

function categoryCounts(bundle: CbtSourceBundleV1): Record<string, number> {
  return Object.fromEntries(
    [...new Set(bundle.masterQuestions.map((row) => row.category))]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((category) => [
        category,
        bundle.masterQuestions.filter((row) => row.category === category).length,
      ]),
  );
}

function sortedCounts(counts: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

export function verifyOperatorArtifact(
  value: unknown,
  contract: OperatorArtifactContract = CBT_EXACT_80_OPERATOR_ARTIFACT_CONTRACT,
): OperatorArtifactSummary {
  const validation = validateCbtSourceBundleV1(value);
  if (!validation.bundle) {
    throw new Error(`cbt_operator_artifact_invalid:${validation.errors.join(",")}`);
  }
  const bundle = validation.bundle;
  const actualCategoryCounts = categoryCounts(bundle);
  const sourceQuestionIds = new Set(bundle.candidateQuestions.map((row) => row.sourceQuestionId));
  const masterQuestionIds = new Set(bundle.masterQuestions.map((row) => row.id));

  if (bundle.manifest.version !== contract.canonicalVersion) {
    throw new Error("cbt_operator_artifact_canonical_version_mismatch");
  }
  if (bundle.checksums.bundleChecksum !== contract.artifactChecksum) {
    throw new Error("cbt_operator_artifact_checksum_mismatch");
  }
  if (JSON.stringify(actualCategoryCounts) !== JSON.stringify(sortedCounts(contract.categoryCounts))) {
    throw new Error("cbt_operator_artifact_category_counts_mismatch");
  }
  if (sourceQuestionIds.has(contract.excludedSourceQuestionId)) {
    throw new Error("cbt_operator_artifact_excluded_source_present");
  }
  if (!sourceQuestionIds.has(contract.includedSourceQuestionId)) {
    throw new Error("cbt_operator_artifact_replacement_source_missing");
  }
  if (!masterQuestionIds.has(contract.replacementMasterQuestionId)) {
    throw new Error("cbt_operator_artifact_replacement_master_missing");
  }

  return {
    canonicalVersion: bundle.manifest.version,
    semanticChecksum: bundle.manifest.checksum,
    artifactChecksum: bundle.checksums.bundleChecksum,
    categoryCounts: actualCategoryCounts,
    candidateQuestionCount: bundle.candidateQuestions.length,
    generatedQuestionCount: bundle.generatedQuestions.length,
    masterQuestionCount: bundle.masterQuestions.length,
    excludedSourceQuestionPresent: false,
    includedReplacementSourceQuestionPresent: true,
    replacementMasterQuestionPresent: true,
    dataMinimization: "PASS",
    dbWrite: false,
  };
}
