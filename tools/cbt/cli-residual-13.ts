import { parseBatchArgs } from "./batch/args";
import {
  runResidual13,
  EXECUTE_CONFIRMATION_TOKEN,
  type ResidualProductionExecutor,
  type ResidualRunMode,
} from "./batch/residual-13-runner";
import {
  loadAndVerifyResidualR1,
  type ResidualFreezeBinding,
  type ResidualLane,
  type ResidualLiveSnapshot,
} from "./batch/residual-13-evidence";

const ALLOWED_FLAGS = new Set(["preflight", "dry-run", "execute"]);
const ALLOWED_VALUES = new Set(["lane", "confirm"]);

function fail(message: string): never {
  throw new Error(`residual-13: ${message}`);
}

async function captureLiveSnapshot(
  binding: ResidualFreezeBinding,
): Promise<ResidualLiveSnapshot> {
  const { prisma } = await import("@/lib/prisma");
  const candidateIds = binding.entries.map((entry) => entry.candidateId);
  const [candidateRows, generatedRows] = await Promise.all([
    prisma.candidateQuestion.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, sourceQuestionId: true },
    }),
    prisma.generatedQuestion.findMany({
      where: { candidateQuestionId: { in: candidateIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const generatedIds = generatedRows.map((row) => row.id);
  const qaRows = generatedIds.length === 0
    ? []
    : await prisma.generatedQuestionQA.findMany({
        where: { generatedQuestionId: { in: generatedIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
  const latestGqByCandidate = new Map<string, (typeof generatedRows)[number]>();
  for (const row of generatedRows) latestGqByCandidate.set(row.candidateQuestionId, row);
  const sourceIdByCandidate = new Map(candidateRows.map((row) => [row.id, row.sourceQuestionId]));
  const latestQaByGenerated = new Map<string, (typeof qaRows)[number]>();
  for (const row of qaRows) latestQaByGenerated.set(row.generatedQuestionId, row);
  const entries = binding.entries.map((expected) => {
    const generated = latestGqByCandidate.get(expected.candidateId);
    const qa = generated ? latestQaByGenerated.get(generated.id) : undefined;
    return {
      ...expected,
      sourceQuestionId: sourceIdByCandidate.get(expected.candidateId) ?? "",
      latestGeneratedQuestionId: generated?.id ?? "",
      latestStatus: (generated?.status ?? "FAILED") as typeof expected.latestStatus,
      latestErrorCode: generated?.errorCode ?? null,
      latestQaId: qa?.id ?? null,
      latestQaIsPass: qa?.isPass ?? null,
      latestQaErrorCode: qa?.errorCode ?? null,
    };
  });
  return {
    capturedAt: new Date().toISOString(),
    entries,
    candidateCount: candidateRows.length,
    generatedQuestionCount: generatedRows.length,
    qaCount: qaRows.length,
    candidateFingerprints: {},
    historicalGqFingerprints: {},
    historicalQaFingerprints: {},
  };
}

async function createProductionExecutor(): Promise<ResidualProductionExecutor> {
  const [{ runContentProduction }, { getDefaultContentDb }, { createConfiguredProvider }] = await Promise.all([
    import("./content/pipeline"),
    import("./content/persist/content-repository"),
    import("./content/provider"),
  ]);
  const db = await getDefaultContentDb();
  const provider = createConfiguredProvider();
  return {
    async run(candidateId) {
      const result = await runContentProduction({ candidateId }, { db, provider });
      const status = result.status === "QA_PASSED"
        ? "QA_PASSED"
        : result.status === "QA_FAILED"
          ? "QA_FAILED"
          : "FAILED";
      return {
        generatedQuestionId: result.generatedQuestionId,
        qaId: null,
        status,
      };
    },
  };
}

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  for (const flag of args.flags) if (!ALLOWED_FLAGS.has(flag)) fail(`unknown flag --${flag}`);
  for (const key of args.values.keys()) if (!ALLOWED_VALUES.has(key)) fail(`unknown option --${key}`);
  if (args.positionals.length > 0) fail("positional arguments are not allowed");
  const laneRaw = args.values.get("lane");
  if (laneRaw !== "transient" && laneRaw !== "semantic") fail("--lane=transient|semantic is required");
  const modes = ["preflight", "dry-run", "execute"].filter((mode) => args.flags.has(mode));
  if (modes.length !== 1) fail("exactly one of --preflight, --dry-run, --execute is required");
  if (args.flags.has("execute") && args.values.get("confirm") !== EXECUTE_CONFIRMATION_TOKEN) fail("execute requires the exact confirmation token");
  if (!args.flags.has("execute") && args.values.has("confirm")) fail("--confirm is only valid with --execute");

  const lane: ResidualLane = laneRaw === "transient" ? "TRANSIENT" : "SEMANTIC";
  const mode = modes[0] as ResidualRunMode;
  const binding = await loadAndVerifyResidualR1();
  const liveSnapshot = mode === "execute" ? await captureLiveSnapshot(binding) : undefined;
  const executor = mode === "execute" ? await createProductionExecutor() : undefined;
  const result = await runResidual13(
    {
      lane,
      mode,
      concurrency: 1,
      attemptBudgetPerCandidate: 1,
      expectedProvider: "zen",
      expectedModel: "deepseek-v4-flash",
      expectedGenerationPromptVersion: "step8-question-gen-v1.1",
      expectedQaPromptVersion: "step8-auto-qa-v3.1",
      confirmationToken: args.values.get("confirm"),
    },
    { binding, liveSnapshot, executor },
  );
  console.log(JSON.stringify({
    mode: result.mode,
    lane: result.lane,
    targetCount: result.targets.length,
    targets: result.targets,
    attemptedCount: result.attemptedCount,
    resolutionComplete: result.resolutionComplete,
    provider: "zen",
    model: "deepseek-v4-flash",
    generationPromptVersion: "step8-question-gen-v1.1",
    qaPromptVersion: "step8-auto-qa-v3.1",
    dbWrite: mode === "execute",
    providerCall: mode === "execute",
  }, null, 2));
}

main().catch((error) => {
  console.error("residual-13 실패:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
