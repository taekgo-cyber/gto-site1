import {
  checksumBlogDurabilityJson,
  type BlogDurabilityBundleV1,
} from "./bundle-v1";
import {
  dryRunBlogDurabilityImportV1,
  type BlogDurabilityDryRunReport,
} from "./dry-run";
import {
  executeValidatedBlogDurabilityImportV1,
  type BlogDurabilityImportReport,
} from "./import";
import {
  assertProductionCanonicalOrigin,
  assertReleaseDatabaseIdentity,
  assertReleaseEvidenceId,
  assertReleaseMutationApproval,
  type ReleaseDatabaseIdentity,
  type ReleaseMutationApproval,
} from "@/lib/release/production-boundary";

export type BlogDurabilityProductionImportPlan = {
  format: "gto.blog-durability-production-import-plan";
  schemaVersion: 1;
  environment: ReleaseDatabaseIdentity["environment"];
  expectedDatabaseHost: string;
  expectedDatabaseName: string;
  bundleChecksum: string;
  actorUserId: string;
  targetBaseUrl: string;
  dryRunChecksum: string;
  expectedCreateCount: number;
  expectedNoOpCount: number;
  expectedCategoryCreateCount: number;
  expectedCategoryReuseCount: number;
  planChecksum: string;
  dryRun: BlogDurabilityDryRunReport;
};

export type BlogDurabilityProductionImportInput = ReleaseDatabaseIdentity & ReleaseMutationApproval & {
  bundle: BlogDurabilityBundleV1;
  actorUserId: string;
  targetBaseUrl: string;
  expectedCanonicalOrigin: string;
  expectedPlanChecksum: string;
  backupEvidenceId: string;
  restoreEvidenceId: string;
};

export type BlogDurabilityProductionImportReport = BlogDurabilityImportReport & {
  releaseEvidence: {
    approvalId: string;
    backupEvidenceId: string;
    restoreEvidenceId: string;
    planChecksum: string;
  };
};

function planPayload(plan: Omit<BlogDurabilityProductionImportPlan, "planChecksum" | "dryRun">) {
  return plan;
}

export async function planBlogDurabilityProductionImportV1(input: ReleaseDatabaseIdentity & {
  bundle: BlogDurabilityBundleV1;
  actorUserId: string;
  targetBaseUrl: string;
  expectedCanonicalOrigin: string;
}): Promise<BlogDurabilityProductionImportPlan> {
  const identity = assertReleaseDatabaseIdentity(input);
  const targetBaseUrl = assertProductionCanonicalOrigin(input);
  const dryRun = await dryRunBlogDurabilityImportV1({
    bundle: input.bundle,
    actorUserId: input.actorUserId,
    targetBaseUrl,
  });
  if (!dryRun.bundleValid || !dryRun.eligibleForWrite || dryRun.errors.length > 0) {
    throw new Error(`BLOG_DURABILITY_PRODUCTION_PLAN_NOT_ELIGIBLE:${dryRun.errors.join(",") || "DRY_RUN_REJECTED"}`);
  }

  const payload = {
    format: "gto.blog-durability-production-import-plan" as const,
    schemaVersion: 1 as const,
    environment: input.environment,
    expectedDatabaseHost: identity.host,
    expectedDatabaseName: identity.databaseName,
    bundleChecksum: input.bundle.checksums.bundleChecksum,
    actorUserId: input.actorUserId,
    targetBaseUrl,
    dryRunChecksum: checksumBlogDurabilityJson(dryRun),
    expectedCreateCount: dryRun.expectedCreateCount,
    expectedNoOpCount: dryRun.expectedNoOpCount,
    expectedCategoryCreateCount: dryRun.expectedCategoryCreateCount,
    expectedCategoryReuseCount: dryRun.expectedCategoryReuseCount,
  };

  return {
    ...payload,
    planChecksum: checksumBlogDurabilityJson(planPayload(payload)),
    dryRun,
  };
}

export async function importBlogDurabilityBundleProductionV1(
  input: BlogDurabilityProductionImportInput,
): Promise<BlogDurabilityProductionImportReport> {
  assertReleaseDatabaseIdentity(input);
  assertReleaseMutationApproval(input);
  assertProductionCanonicalOrigin(input);
  const backupEvidenceId = assertReleaseEvidenceId(input.backupEvidenceId, "BLOG_DURABILITY_BACKUP_EVIDENCE_INVALID");
  const restoreEvidenceId = assertReleaseEvidenceId(input.restoreEvidenceId, "BLOG_DURABILITY_RESTORE_EVIDENCE_INVALID");
  if (!/^[a-f0-9]{64}$/.test(input.expectedPlanChecksum)) {
    throw new Error("BLOG_DURABILITY_PLAN_CHECKSUM_INVALID");
  }

  const plan = await planBlogDurabilityProductionImportV1(input);
  if (plan.planChecksum !== input.expectedPlanChecksum) {
    throw new Error("BLOG_DURABILITY_PLAN_DRIFT");
  }

  const report = await executeValidatedBlogDurabilityImportV1({
    bundle: input.bundle,
    actorUserId: input.actorUserId,
    dryRun: plan.dryRun,
    environment: input.environment === "production" ? "production" : "disposable",
  });

  return {
    ...report,
    releaseEvidence: {
      approvalId: input.approvalId.trim(),
      backupEvidenceId,
      restoreEvidenceId,
      planChecksum: plan.planChecksum,
    },
  };
}
