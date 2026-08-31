import {
  buildCbtSourceBundleV1,
  checksumCbtSourceJson,
  stableCbtSourceJson,
  type verifyExact80Manifest,
} from "./bundle-v1";
import type { CbtSourceBundleV1, SourceGraphRepository } from "./types";

type VerifiedManifest = ReturnType<typeof verifyExact80Manifest>;

export type CbtSourceExportReport = {
  bundle: CbtSourceBundleV1;
  selectedMasterCount: number;
  dependencyCounts: {
    CandidateQuestion: number;
    GeneratedQuestion: number;
    MasterQuestion: number;
  };
  missingDependencies: string[];
  duplicateIdentities: string[];
  knownBadIncluded: string[];
  bundleChecksum: string;
  sourceReadBackUnchanged: boolean;
  dbWrite: false;
};

function graphFingerprint(rows: Awaited<ReturnType<SourceGraphRepository["listSourceGraph"]>>): string {
  return checksumCbtSourceJson(
    rows
      .map((row) => ({
        candidate: { ...row.candidate, fetchedAt: row.candidate.fetchedAt?.toISOString() ?? null },
        generated: row.generated,
        master: { ...row.master, publishedAt: row.master.publishedAt?.toISOString() ?? null },
      }))
      .sort((left, right) => left.master.id.localeCompare(right.master.id, "en")),
  );
}

export async function exportCbtSourceBundleV1(input: {
  repository: SourceGraphRepository;
  manifest: VerifiedManifest;
  exportedAt: Date;
  branch: string;
  head: string;
}): Promise<CbtSourceExportReport> {
  const identity = await input.repository.databaseIdentity();
  const databaseIdentityFingerprint = checksumCbtSourceJson(identity);
  const first = await input.repository.listSourceGraph(input.manifest.selectedMasterIds);
  const firstFingerprint = graphFingerprint(first);
  const bundle = buildCbtSourceBundleV1({
    manifest: input.manifest,
    graphRows: first,
    exportedAt: input.exportedAt,
    branch: input.branch,
    head: input.head,
    databaseIdentityFingerprint,
  });
  const second = await input.repository.listSourceGraph(input.manifest.selectedMasterIds);
  const sourceReadBackUnchanged = firstFingerprint === graphFingerprint(second);
  if (!sourceReadBackUnchanged) throw new Error("cbt_source_export_readback_changed");

  const duplicateIdentities = [
    ...new Set(
      [
        ...bundle.candidateQuestions.map((row) => `CandidateQuestion:${row.id}`),
        ...bundle.generatedQuestions.map((row) => `GeneratedQuestion:${row.id}`),
        ...bundle.masterQuestions.map((row) => `MasterQuestion:${row.id}`),
      ].filter((identityValue, index, all) => all.indexOf(identityValue) !== index),
    ),
  ];
  const knownBadIncluded = input.manifest.knownBadMasterIds.filter((id) =>
    bundle.masterQuestions.some((row) => row.id === id),
  );
  if (duplicateIdentities.length > 0) throw new Error("cbt_source_export_duplicate_identity");
  if (knownBadIncluded.length > 0) throw new Error("cbt_source_export_known_bad_included");
  if (stableCbtSourceJson(bundle.manifest.selectedMasterIds) !== stableCbtSourceJson(input.manifest.selectedMasterIds)) {
    throw new Error("cbt_source_export_selection_changed");
  }

  return {
    bundle,
    selectedMasterCount: bundle.masterQuestions.length,
    dependencyCounts: {
      CandidateQuestion: bundle.candidateQuestions.length,
      GeneratedQuestion: bundle.generatedQuestions.length,
      MasterQuestion: bundle.masterQuestions.length,
    },
    missingDependencies: [],
    duplicateIdentities,
    knownBadIncluded,
    bundleChecksum: bundle.checksums.bundleChecksum,
    sourceReadBackUnchanged,
    dbWrite: false,
  };
}
