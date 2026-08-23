import { parseBatchArgs } from "./batch/args";
import {
  assertForensicPass,
  assertLaneATarget,
  collectLaneAForensic,
  evidenceCollision,
  UNCERTAIN_CONFIRMATION_TOKEN,
  UNCERTAIN_EVIDENCE_ROOT,
  verifyUncertainEvidence,
  writeUncertainEvidence,
  type UncertainEvidenceDb,
} from "./batch/residual-13-uncertain-evidence";
import { loadAndVerifyResidualR1 } from "./batch/residual-13-evidence";

const ALLOWED_FLAGS = new Set(["preflight", "write-evidence"]);
const ALLOWED_VALUES = new Set(["confirm"]);

function fail(message: string): never {
  throw new Error(`residual-13-uncertain: ${message}`);
}

function stableSummary(summary: unknown): string {
  return JSON.stringify(summary);
}

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  for (const flag of args.flags) if (!ALLOWED_FLAGS.has(flag)) fail(`unknown flag --${flag}`);
  for (const key of args.values.keys()) if (!ALLOWED_VALUES.has(key)) fail(`unknown option --${key}`);
  if (args.positionals.length > 0) fail("positional arguments are not allowed");
  const modes = ["preflight", "write-evidence"].filter((mode) => args.flags.has(mode));
  if (modes.length !== 1) fail("exactly one of --preflight or --write-evidence is required");
  const mode = modes[0];
  const confirmation = args.values.get("confirm");
  if (mode === "preflight" && confirmation !== undefined) fail("--confirm is only valid with --write-evidence");
  if (mode === "write-evidence" && confirmation !== UNCERTAIN_CONFIRMATION_TOKEN) fail("write-evidence requires the exact confirmation token");

  const binding = await loadAndVerifyResidualR1();
  const targets = assertLaneATarget(binding);
  const { prisma } = await import("@/lib/prisma");
  try {
    const db = prisma as unknown as UncertainEvidenceDb;
    const firstSummary = await collectLaneAForensic(db, binding);
    assertForensicPass(firstSummary);
    const collision = await evidenceCollision(UNCERTAIN_EVIDENCE_ROOT);
    if (mode === "preflight") {
      console.log(JSON.stringify({
        mode,
        targetCount: targets.length,
        targetHash: "A7DAC798A71CBDB65A25E9CA7CE9D54B8DBB88E073AEE71EE6188A67FDB8F357",
        newGQCount: firstSummary.newGQCount,
        newQACount: firstSummary.newQACount,
        forensic: firstSummary,
        evidenceCollision: collision,
        providerCall: false,
        dbWrite: false,
        evidenceWrite: false,
      }, null, 2));
      return;
    }

    const secondSummary = await collectLaneAForensic(db, binding);
    assertForensicPass(secondSummary);
    if (stableSummary(firstSummary) !== stableSummary(secondSummary)) fail("R9B forensic state changed before evidence write");
    if (await evidenceCollision(UNCERTAIN_EVIDENCE_ROOT)) fail("evidence collision detected before write");
    const written = await writeUncertainEvidence({
      binding,
      summary: secondSummary,
      confirmationToken: confirmation,
    });
    await verifyUncertainEvidence(written.directory, binding);
    console.log(JSON.stringify({
      mode,
      targetCount: targets.length,
      targetHash: "A7DAC798A71CBDB65A25E9CA7CE9D54B8DBB88E073AEE71EE6188A67FDB8F357",
      newGQCount: secondSummary.newGQCount,
      newQACount: secondSummary.newQACount,
      forensic: secondSummary,
      evidenceDirectory: written.directory,
      evidenceWrite: true,
      providerCall: 0,
      dbWrite: 0,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("residual-13-uncertain failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
