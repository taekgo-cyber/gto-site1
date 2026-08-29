import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportBlogDurabilityBundleV1 } from "@/lib/blog/durability/export";
import {
  serializeBlogDurabilityBundle,
  stableBlogDurabilityJson,
  verifyBlogDurabilityBundleChecksums,
} from "@/lib/blog/durability/bundle-v1";
import { prisma } from "@/lib/prisma";

type CliArgs = {
  output: string;
  environmentLabel: string;
  branch: string;
  head: string;
  exportedAt?: Date;
};

function valueAfter(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return undefined;
  return argv[index + 1];
}

export function parseBlogDurabilityExportArgs(argv: string[]): CliArgs {
  const output = valueAfter(argv, "--output");
  const environmentLabel = valueAfter(argv, "--environment");
  const branch = valueAfter(argv, "--branch");
  const head = valueAfter(argv, "--head");
  const exportedAtRaw = valueAfter(argv, "--exported-at");
  if (!output || !environmentLabel || !branch || !head) throw new Error("BLOG_DURABILITY_EXPORT_ARGS_REQUIRED");

  const known = new Set(["--output", "--environment", "--branch", "--head", "--exported-at"]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!known.has(argv[index]) || index + 1 >= argv.length) throw new Error("BLOG_DURABILITY_EXPORT_ARG_INVALID");
  }

  const exportedAt = exportedAtRaw ? new Date(exportedAtRaw) : undefined;
  if (exportedAt && Number.isNaN(exportedAt.getTime())) throw new Error("BLOG_DURABILITY_EXPORTED_AT_INVALID");
  return { output: path.resolve(output), environmentLabel, branch, head, exportedAt };
}

export async function runBlogDurabilityExport(argv: string[]): Promise<void> {
  const args = parseBlogDurabilityExportArgs(argv);
  const exportedAt = args.exportedAt ?? new Date();
  const source = {
    environmentLabel: args.environmentLabel,
    branch: args.branch,
    head: args.head,
    exporterVersion: "1",
  };
  const bundle = await exportBlogDurabilityBundleV1({
    exportedAt,
    source,
  });
  if (!verifyBlogDurabilityBundleChecksums(bundle)) throw new Error("BLOG_DURABILITY_BUNDLE_CHECKSUM_INVALID");

  const parent = await stat(path.dirname(args.output));
  if (!parent.isDirectory()) throw new Error("BLOG_DURABILITY_OUTPUT_PARENT_INVALID");
  await writeFile(args.output, serializeBlogDurabilityBundle(bundle), { encoding: "utf8", flag: "wx" });
  const readBack = await exportBlogDurabilityBundleV1({ exportedAt, source });
  const dbReadBackUnchanged = stableBlogDurabilityJson(bundle) === stableBlogDurabilityJson(readBack);
  if (!dbReadBackUnchanged) throw new Error("BLOG_DURABILITY_DB_READ_BACK_CHANGED");
  console.log(
    JSON.stringify({
      output: args.output,
      articleCount: bundle.summary.articleCount,
      countsByStatus: bundle.summary.countsByStatus,
      excludedArchivedCount: bundle.summary.excludedArchivedCount,
      featuredImageRefCount: bundle.summary.featuredImageRefCount,
      bodyImageRefCount: bundle.summary.bodyImageRefCount,
      bundleChecksum: bundle.checksums.bundleChecksum,
      dbReadBackUnchanged,
      dbWrite: false,
    }),
  );
}

runBlogDurabilityExport(process.argv.slice(2))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "BLOG_DURABILITY_EXPORT_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
