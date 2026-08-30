import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogDurabilityBundleV1 } from "@/lib/blog/durability/bundle-v1";
import type { BlogDurabilityDryRunReport } from "@/lib/blog/durability/dry-run";
import { RELEASE_MUTATION_ACK } from "@/lib/release/production-boundary";

const mocks = vi.hoisted(() => ({
  dryRun: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/blog/durability/dry-run", () => ({
  dryRunBlogDurabilityImportV1: mocks.dryRun,
}));
vi.mock("@/lib/blog/durability/import", () => ({
  executeValidatedBlogDurabilityImportV1: mocks.execute,
}));

import {
  importBlogDurabilityBundleProductionV1,
  planBlogDurabilityProductionImportV1,
} from "@/lib/blog/durability/production-import";

const bundle = {
  format: "gto.blog-durability",
  schemaVersion: 1,
  exportedAt: "2026-08-30T00:00:00.000Z",
  source: { environmentLabel: "test", branch: "test", head: "head", exporterVersion: "1" },
  selection: { articleSlugs: [], includedStatuses: ["DRAFT", "PUBLISHED"] },
  categories: [],
  articles: [],
  checksums: { algorithm: "sha256", canonicalization: "gto-stable-json-v1", bundleChecksum: "a".repeat(64) },
  summary: { categoryCount: 0, articleCount: 0, countsByStatus: { DRAFT: 0, PUBLISHED: 0 }, featuredImageRefCount: 0, bodyImageRefCount: 0, excludedArchivedCount: 0, excludedArchivedSlugs: [] },
} as BlogDurabilityBundleV1;

const dryRun: BlogDurabilityDryRunReport = {
  bundleValid: true,
  eligibleForWrite: true,
  wouldWrite: false,
  categories: [],
  articles: [],
  authorMapping: { sourceAuthorIds: [], targetActorUserId: "admin-1", targetActorValidated: true },
  automationPolicy: { targetAutomationJobId: null, preservedSourceJobRefs: [] },
  imageTransforms: [],
  checksumResults: { bundleChecksumValid: true, expectedTargetContentChecksums: [], expectedTargetStateChecksums: [] },
  warnings: [],
  errors: [],
  expectedBundleArticleCount: 0,
  expectedBundleCountsByStatus: { DRAFT: 0, PUBLISHED: 0 },
  expectedCreateCount: 0,
  expectedNoOpCount: 0,
  expectedCategoryCreateCount: 0,
  expectedCategoryReuseCount: 0,
};

const disposable = {
  environment: "disposable" as const,
  expectedDatabaseHost: "127.0.0.1",
  expectedDatabaseName: "release_test",
  bundle,
  actorUserId: "admin-1",
  targetBaseUrl: "https://www.example.com",
  expectedCanonicalOrigin: "https://www.example.com",
};

describe("Production-safe Blog durability import release layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:55433/release_test";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mocks.dryRun.mockResolvedValue(dryRun);
    mocks.execute.mockResolvedValue({
      environment: "disposable",
      committed: true,
      dryRun,
      createdCategorySlugs: [],
      reusedCategorySlugs: [],
      createdArticleSlugs: [],
      noOpArticleSlugs: [],
      postCommitVerified: true,
    });
  });

  it("builds a deterministic read-only plan after an eligible dry-run", async () => {
    const plan = await planBlogDurabilityProductionImportV1(disposable);
    expect(plan.planChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.dryRun.wouldWrite).toBe(false);
    expect(plan.bundleChecksum).toBe(bundle.checksums.bundleChecksum);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("fails before dry-run when the exact target database identity drifts", async () => {
    await expect(planBlogDurabilityProductionImportV1({ ...disposable, expectedDatabaseName: "wrong" }))
      .rejects.toThrow("RELEASE_TARGET_IDENTITY_MISMATCH");
    expect(mocks.dryRun).not.toHaveBeenCalled();
  });

  it("requires production NODE_ENV, non-loopback DB, and canonical NEXT_PUBLIC_SITE_URL in production mode", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@prod-db.example.net:5432/gto_prod";
    await expect(planBlogDurabilityProductionImportV1({
      ...disposable,
      environment: "production",
      expectedDatabaseHost: "prod-db.example.net",
      expectedDatabaseName: "gto_prod",
    })).rejects.toThrow("RELEASE_PRODUCTION_NODE_ENV_REQUIRED");

    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_SITE_URL = "https://wrong.example.com";
    await expect(planBlogDurabilityProductionImportV1({
      ...disposable,
      environment: "production",
      expectedDatabaseHost: "prod-db.example.net",
      expectedDatabaseName: "gto_prod",
    })).rejects.toThrow("RELEASE_PRODUCTION_SITE_URL_MISMATCH");
  });

  it("requires explicit mutation approval and recovery evidence before the import executor is reached", async () => {
    const plan = await planBlogDurabilityProductionImportV1(disposable);
    await expect(importBlogDurabilityBundleProductionV1({
      ...disposable,
      expectedPlanChecksum: plan.planChecksum,
      backupEvidenceId: "backup-20260830-001",
      restoreEvidenceId: "restore-20260830-001",
      approvalId: "release-approval-001",
      acknowledgement: "no",
    })).rejects.toThrow("RELEASE_MUTATION_ACK_REQUIRED");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("stops on plan drift before starting the transactional executor", async () => {
    await expect(importBlogDurabilityBundleProductionV1({
      ...disposable,
      expectedPlanChecksum: "b".repeat(64),
      backupEvidenceId: "backup-20260830-001",
      restoreEvidenceId: "restore-20260830-001",
      approvalId: "release-approval-001",
      acknowledgement: RELEASE_MUTATION_ACK,
    })).rejects.toThrow("BLOG_DURABILITY_PLAN_DRIFT");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("reuses the validated Gate 6 transactional executor only after the plan and evidence still match", async () => {
    const plan = await planBlogDurabilityProductionImportV1(disposable);
    const report = await importBlogDurabilityBundleProductionV1({
      ...disposable,
      expectedPlanChecksum: plan.planChecksum,
      backupEvidenceId: "backup-20260830-001",
      restoreEvidenceId: "restore-20260830-001",
      approvalId: "release-approval-001",
      acknowledgement: RELEASE_MUTATION_ACK,
    });

    expect(mocks.execute).toHaveBeenCalledWith({
      bundle,
      actorUserId: "admin-1",
      dryRun,
      environment: "disposable",
    });
    expect(report.releaseEvidence).toEqual({
      approvalId: "release-approval-001",
      backupEvidenceId: "backup-20260830-001",
      restoreEvidenceId: "restore-20260830-001",
      planChecksum: plan.planChecksum,
    });
  });
});
