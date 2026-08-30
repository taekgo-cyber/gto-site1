import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import {
  checksumBlogDurabilityJson,
  categoryChecksumPayload,
  articleContentChecksumPayload,
  articleStateChecksumPayload,
  bundleChecksumPayload,
  type BlogDurabilityBundleV1,
} from "../../src/lib/blog/durability/bundle-v1";
import {
  importBlogDurabilityBundleProductionV1,
  planBlogDurabilityProductionImportV1,
} from "../../src/lib/blog/durability/production-import";
import { RELEASE_MUTATION_ACK } from "../../src/lib/release/production-boundary";

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function fixtureBundle(proofId: string): BlogDurabilityBundleV1 {
  const now = "2026-08-30T02:00:00.000Z";
  const slug = `release-wrapper-proof-${proofId}`;
  const featuredPath = `/images/blog/${slug}-featured.webp`;
  const bodyPath = `/images/blog/${slug}-body.webp`;
  const category = {
    slug: "release-proof",
    name: "Release Proof",
    description: "Disposable release tooling proof",
    isActive: true,
    sortOrder: 999,
    source: { id: "source-release-proof", createdAt: now, updatedAt: now },
    checksum: "",
  };
  category.checksum = checksumBlogDurabilityJson(categoryChecksumPayload(category));

  const article = {
    slug,
    title: "Release wrapper disposable proof",
    excerpt: "Disposable PostgreSQL proof for the guarded release import wrapper.",
    contentMarkdown: `Release tooling proof body.\n\n![Proof](http://localhost:3000${bodyPath})\n`,
    tags: ["release-proof"],
    categorySlug: category.slug,
    seoTitle: "Release wrapper proof",
    seoDescription: "Disposable proof only",
    featuredImageUrl: `http://localhost:3000${featuredPath}`,
    featuredImageAlt: "Release proof",
    contentOrigin: "MANUAL" as const,
    aiGenerationMeta: null,
    status: "DRAFT" as const,
    publishedAt: null,
    imageRefs: {
      featured: {
        url: `http://localhost:3000${featuredPath}`,
        alt: "Release proof",
        assetPath: featuredPath,
      },
      body: [{
        url: `http://localhost:3000${bodyPath}`,
        alt: "Proof",
        assetPath: bodyPath,
        occurrence: 0,
      }],
    },
    source: {
      id: "source-release-proof-article",
      createdAt: now,
      updatedAt: now,
      authorRef: { sourceId: "source-author-proof" },
      automationJobRef: null,
    },
    checksums: { contentChecksum: "", stateChecksum: "" },
  };
  article.checksums.contentChecksum = checksumBlogDurabilityJson(articleContentChecksumPayload(article));
  article.checksums.stateChecksum = checksumBlogDurabilityJson(articleStateChecksumPayload(article));

  const bundle: BlogDurabilityBundleV1 = {
    format: "gto.blog-durability",
    schemaVersion: 1,
    exportedAt: now,
    source: { environmentLabel: "release-disposable-proof", branch: "local-proof", head: "0".repeat(40), exporterVersion: "1" },
    selection: { articleSlugs: [slug], includedStatuses: ["DRAFT", "PUBLISHED"] },
    categories: [category],
    articles: [article],
    checksums: { algorithm: "sha256", canonicalization: "gto-stable-json-v1", bundleChecksum: "" },
    summary: {
      categoryCount: 1,
      articleCount: 1,
      countsByStatus: { DRAFT: 1, PUBLISHED: 0 },
      featuredImageRefCount: 1,
      bodyImageRefCount: 1,
      excludedArchivedCount: 0,
      excludedArchivedSlugs: [],
    },
  };
  bundle.checksums.bundleChecksum = checksumBlogDurabilityJson(bundleChecksumPayload(bundle));
  return bundle;
}

async function main() {
  const expectedDatabaseHost = valueAfter(process.argv.slice(2), "--expected-db-host");
  const expectedDatabaseName = valueAfter(process.argv.slice(2), "--expected-db-name");
  const adminEmail = valueAfter(process.argv.slice(2), "--admin-email");
  if (!expectedDatabaseHost || !expectedDatabaseName || !adminEmail) {
    throw new Error("RELEASE_DISPOSABLE_VERIFY_ARGS_REQUIRED");
  }

  const admin = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() }, select: { id: true } });
  if (!admin) throw new Error("RELEASE_DISPOSABLE_VERIFY_ADMIN_MISSING");

  const proofId = valueAfter(process.argv.slice(2), "--proof-id") ?? Date.now().toString(36);
  if (!/^[a-z0-9-]{4,40}$/.test(proofId)) throw new Error("RELEASE_DISPOSABLE_VERIFY_PROOF_ID_INVALID");
  const bundle = fixtureBundle(proofId);
  const base = {
    environment: "disposable" as const,
    expectedDatabaseHost,
    expectedDatabaseName,
    bundle,
    actorUserId: admin.id,
    targetBaseUrl: "https://release-proof.example.com",
    expectedCanonicalOrigin: "https://release-proof.example.com",
  };
  const evidence = {
    ...base,
    backupEvidenceId: "backup-disposable-proof-001",
    restoreEvidenceId: "restore-disposable-proof-001",
    approvalId: "release-local-proof-002",
    acknowledgement: RELEASE_MUTATION_ACK,
  };

  const plan1 = await planBlogDurabilityProductionImportV1(base);
  const first = await importBlogDurabilityBundleProductionV1({ ...evidence, expectedPlanChecksum: plan1.planChecksum });
  const plan2 = await planBlogDurabilityProductionImportV1(base);

  let stalePlanBlocked = false;
  try {
    await importBlogDurabilityBundleProductionV1({ ...evidence, expectedPlanChecksum: plan1.planChecksum });
  } catch (error) {
    stalePlanBlocked = error instanceof Error && error.message === "BLOG_DURABILITY_PLAN_DRIFT";
  }
  if (!stalePlanBlocked) throw new Error("RELEASE_DISPOSABLE_STALE_PLAN_NOT_BLOCKED");

  const second = await importBlogDurabilityBundleProductionV1({ ...evidence, expectedPlanChecksum: plan2.planChecksum });
  process.stdout.write(`${JSON.stringify({
    plan1: { checksum: plan1.planChecksum, create: plan1.expectedCreateCount, noOp: plan1.expectedNoOpCount, wouldWrite: plan1.dryRun.wouldWrite },
    first: { created: first.createdArticleSlugs, noOp: first.noOpArticleSlugs, verified: first.postCommitVerified },
    stalePlanBlocked,
    plan2: { checksum: plan2.planChecksum, create: plan2.expectedCreateCount, noOp: plan2.expectedNoOpCount, wouldWrite: plan2.dryRun.wouldWrite },
    second: { created: second.createdArticleSlugs, noOp: second.noOpArticleSlugs, verified: second.postCommitVerified },
  }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "RELEASE_DISPOSABLE_VERIFY_FAILED"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
