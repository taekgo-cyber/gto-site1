import "dotenv/config";
import { parseBatchArgs, parseIds, readIdsFile } from "./batch/args";
import { assertLocalPublicationDatabaseBoundary } from "./publication/boundary";
import { createPrismaPublicationDatabase } from "./publication/prisma-repository";
import { executeMasterPublication, planMasterPublication } from "./publication/service";
import type { PublicationPlan, PublicationTargetStatus } from "./publication/types";

const ALLOWED_FLAGS = new Set(["all", "dry-run", "execute", "publish"]);
const ALLOWED_VALUES = new Set(["ids", "ids-file"]);

function fail(message: string): never {
  throw new Error(message);
}

async function resolveSelection(argv: string[]): Promise<{
  ids: string[] | null;
  dryRun: boolean;
  targetStatus: PublicationTargetStatus;
}> {
  const args = parseBatchArgs(argv);
  if (args.positionals.length > 0) fail(`unknown arguments: ${args.positionals.join(",")}`);
  for (const flag of args.flags) if (!ALLOWED_FLAGS.has(flag)) fail(`unknown flag: --${flag}`);
  for (const key of args.values.keys()) if (!ALLOWED_VALUES.has(key)) fail(`unknown option: --${key}`);

  const dryRun = args.flags.has("dry-run");
  const execute = args.flags.has("execute");
  if (dryRun === execute) fail("exactly_one_of_dry_run_or_execute_required");

  const inlineIds = parseIds(args.values.get("ids"));
  const idsFile = args.values.get("ids-file");
  const all = args.flags.has("all");
  const selectionModes = Number(inlineIds.length > 0) + Number(Boolean(idsFile)) + Number(all);
  if (selectionModes !== 1) fail("exactly_one_of_ids_ids_file_or_all_required");
  if (all && execute) fail("publication_execute_all_forbidden_use_explicit_ids");

  const ids = all ? null : idsFile ? await readIdsFile(idsFile) : inlineIds;
  if (ids && ids.length === 0) fail("publication_selection_empty");
  return {
    ids,
    dryRun,
    targetStatus: args.flags.has("publish") ? "PUBLISHED" : "DRAFT",
  };
}

function printPlan(plan: PublicationPlan): void {
  console.log("CBT PUBLICATION PLAN");
  console.log(`planId=${plan.planId}`);
  console.log(`selected=${plan.selectedCount}`);
  console.log(`selectedMasters=${plan.selectedMasterCount}`);
  console.log(`eligible=${plan.eligibleCount}`);
  console.log(`wouldCreate=${plan.wouldCreate}`);
  console.log(`wouldPublish=${plan.wouldPublish}`);
  console.log(`wouldNoOp=${plan.wouldNoOp}`);
  console.log(`wouldConflict=${plan.wouldConflict}`);
  console.log(`invalid=${plan.invalidCount}`);
  console.log(`categoryDistribution=${JSON.stringify(plan.categoryDistribution)}`);
  console.log(`targetStatus=${plan.targetStatus}`);
  console.log("DB write=false");
  for (const item of plan.items) {
    console.log(
      `${item.masterQuestionId}\t${item.action}\t${item.subject ?? "-"}\t${item.reasons.join(",") || "-"}`,
    );
  }
}

async function main(): Promise<void> {
  const selection = await resolveSelection(process.argv.slice(2));
  assertLocalPublicationDatabaseBoundary();
  const database = createPrismaPublicationDatabase();
  try {
    if (selection.dryRun) {
      printPlan(await planMasterPublication(database, selection));
      return;
    }

    const result = await executeMasterPublication(database, {
      ids: selection.ids as string[],
      targetStatus: selection.targetStatus,
    });
    printPlan(result.plan);
    console.log("CBT PUBLICATION EXECUTION");
    console.log(`created=${result.created}`);
    console.log(`published=${result.published}`);
    console.log(`noOp=${result.noOp}`);
    console.log(`postWriteVerified=${result.postWriteVerified}`);
  } finally {
    await database.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
