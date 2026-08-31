import { planCbtSourceImportV1, sourceBundleForPlan } from "./preflight";
import type { SourceImportDatabase, TargetIdentity } from "./types";

export const CBT_SOURCE_IMPORT_APPROVAL =
  "I approve the bounded exact-80 Staging canonical source import only; do not publish or clean up samples.";

export type SourceImportResult = {
  committed: true;
  planChecksum: string;
  bundleChecksum: string;
  created: {
    CandidateQuestion: number;
    GeneratedQuestion: number;
    MasterQuestion: number;
  };
  noOp: {
    CandidateQuestion: number;
    GeneratedQuestion: number;
    MasterQuestion: number;
  };
  postCommitVerified: true;
};

export async function executeCbtSourceImportV1(input: {
  database: SourceImportDatabase;
  bundle: unknown;
  target: Omit<
    TargetIdentity,
    "database" | "address" | "port" | "serverVersion" | "databaseIdentityFingerprint" | "routedViaLocalTunnel"
  >;
  expectedMigrationNames: readonly string[];
  expectedPlanChecksum: string;
  approval: string;
}): Promise<SourceImportResult> {
  if (input.approval !== CBT_SOURCE_IMPORT_APPROVAL) throw new Error("cbt_source_import_approval_required");
  const initialPlan = await planCbtSourceImportV1({
    repository: input.database,
    bundle: input.bundle,
    target: input.target,
    expectedMigrationNames: input.expectedMigrationNames,
  });
  if (initialPlan.planChecksum !== input.expectedPlanChecksum) throw new Error("cbt_source_import_plan_checksum_mismatch");
  if (!initialPlan.eligibleForImport) throw new Error("cbt_source_import_plan_blocked");
  const bundle = sourceBundleForPlan(initialPlan, input.bundle);

  const result = await input.database.transaction(async (transaction) => {
    const transactionPlan = await planCbtSourceImportV1({
      repository: transaction,
      bundle,
      target: input.target,
      expectedMigrationNames: input.expectedMigrationNames,
    });
    if (transactionPlan.planChecksum !== initialPlan.planChecksum) {
      throw new Error("cbt_source_import_target_drift");
    }
    for (const row of bundle.candidateQuestions) {
      const action = transactionPlan.tables.CandidateQuestion.find((item) => item.id === row.id)?.action;
      if (action === "CREATE") await transaction.createCandidateQuestion(row);
      else if (action !== "NO_OP") throw new Error("cbt_source_import_candidate_conflict");
    }
    for (const row of bundle.generatedQuestions) {
      const action = transactionPlan.tables.GeneratedQuestion.find((item) => item.id === row.id)?.action;
      if (action === "CREATE") await transaction.createGeneratedQuestion(row);
      else if (action !== "NO_OP") throw new Error("cbt_source_import_generated_conflict");
    }
    for (const row of bundle.masterQuestions) {
      const action = transactionPlan.tables.MasterQuestion.find((item) => item.id === row.id)?.action;
      if (action === "CREATE") await transaction.createMasterQuestion(row);
      else if (action !== "NO_OP") throw new Error("cbt_source_import_master_conflict");
    }
    const readBack = await planCbtSourceImportV1({
      repository: transaction,
      bundle,
      target: input.target,
      expectedMigrationNames: input.expectedMigrationNames,
    });
    if (
      !readBack.eligibleForImport ||
      Object.values(readBack.wouldCreate).some((count) => count !== 0) ||
      Object.values(readBack.conflicts).some((count) => count !== 0)
    ) {
      throw new Error("cbt_source_import_readback_mismatch");
    }
    return {
      created: initialPlan.wouldCreate,
      noOp: initialPlan.wouldNoOp,
    };
  });

  const postCommit = await planCbtSourceImportV1({
    repository: input.database,
    bundle,
    target: input.target,
    expectedMigrationNames: input.expectedMigrationNames,
  });
  if (
    !postCommit.eligibleForImport ||
    Object.values(postCommit.wouldCreate).some((count) => count !== 0) ||
    Object.values(postCommit.conflicts).some((count) => count !== 0)
  ) {
    throw new Error("cbt_source_import_post_commit_mismatch");
  }
  return {
    committed: true,
    planChecksum: initialPlan.planChecksum,
    bundleChecksum: initialPlan.bundleChecksum,
    ...result,
    postCommitVerified: true,
  };
}
