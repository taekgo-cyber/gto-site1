// Gate 2 POST-FAILURE RECOVERY v1/v2 CLI — explicit lane + policy-version required (fail-closed).
import "dotenv/config";
import { parseBatchArgs } from "./batch/args";
import { resolveGate2RecoveryPolicy, runGate2RecoveryWithSelection } from "./batch/gate2-recovery";
import type { RecoveryLane } from "./batch/gate2-recovery-policy";

const USAGE = "사용법: npm run cbt:gate2-recovery -- --lane=contract|provider --policy-version=gate2-post-failure-recovery-v1|gate2-post-failure-recovery-v2 (추가 옵션 금지)";
const ALLOWED_POLICY_VERSIONS = new Set(["gate2-post-failure-recovery-v1", "gate2-post-failure-recovery-v2"]);
const EXIT_CODE_INVALID_ARGS = 1;

export function parseGate2RecoveryCliArgs(argv: string[]): { lane: RecoveryLane; policyVersion: string } {
  const args = parseBatchArgs(argv);
  {
    let laneCount = 0;
    let policyVersionCount = 0;
    for (const token of argv) {
      if (!token.startsWith("--")) continue;
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq === -1) continue;
      const key = body.slice(0, eq);
      if (key === "lane") laneCount += 1;
      if (key === "policy-version") policyVersionCount += 1;
    }
    if (laneCount > 1 || policyVersionCount > 1) {
      throw new Error(USAGE);
    }
  }
  // single explicit config path — reject unknown options, flags, positionals, and never fallback
  if (args.flags.size !== 0 || args.positionals.length !== 0) {
    throw new Error(USAGE);
  }
  for (const key of args.values.keys()) {
    if (key !== "lane" && key !== "policy-version") {
      throw new Error(`${USAGE} — unknown option --${key}`);
    }
  }
  if (!args.values.has("lane")) {
    throw new Error(USAGE);
  }
  const lane = args.values.get("lane");
  if (lane !== "contract" && lane !== "provider") {
    throw new Error(`${USAGE} — fail-closed: unknown selection lane=${String(lane)} policyVersion=${String(args.values.get("policy-version"))}`);
  }
  // permit exactly one legacy lane-only invocation defaulting to v1
  if (args.values.size === 1) {
    const policyVersion = "gate2-post-failure-recovery-v1";
    resolveGate2RecoveryPolicy({ lane: lane as RecoveryLane, policyVersion });
    return { lane: lane as RecoveryLane, policyVersion };
  }
  if (args.values.size === 2) {
    if (!args.values.has("policy-version")) {
      throw new Error(USAGE);
    }
    const policyVersion = args.values.get("policy-version");
    if (!policyVersion || !ALLOWED_POLICY_VERSIONS.has(policyVersion)) {
      throw new Error(`${USAGE} — fail-closed: unknown selection lane=${String(lane)} policyVersion=${String(policyVersion)}`);
    }
    // explicit v2 only with provider; unknown version and v2-contract fail closed via resolver
    resolveGate2RecoveryPolicy({ lane: lane as RecoveryLane, policyVersion });
    return { lane: lane as RecoveryLane, policyVersion };
  }
  throw new Error(USAGE);
}

async function main(): Promise<void> {
  let selection: { lane: RecoveryLane; policyVersion: string };
  try {
    selection = parseGate2RecoveryCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = EXIT_CODE_INVALID_ARGS;
    return;
  }
  const mod = await import("@/lib/prisma");
  const { getDefaultContentDb } = await import("./content/persist/content-repository");
  const { runContentProduction } = await import("./content/pipeline");
  const { createConfiguredProvider } = await import("./content/provider");
  const db = await getDefaultContentDb();
  const provider = createConfiguredProvider();
  const result = await runGate2RecoveryWithSelection(selection, {
    stateStore: {
      findCandidatesByIds: (ids) => mod.prisma.candidateQuestion.findMany({ where: { id: { in: [...ids] } }, select: { id: true } }),
      findGeneratedQuestionsByCandidateIds: (ids) =>
        mod.prisma.generatedQuestion.findMany({
          where: { candidateQuestionId: { in: [...ids] } },
          select: { id: true, candidateQuestionId: true, status: true, errorCode: true, createdAt: true },
        }),
    },
    executeCandidate: (candidateId) => runContentProduction({ candidateId }, { db, provider }),
    runLogDir: "data/cbt/runs",
  });
  console.log(JSON.stringify(result, (_key, value) => (value instanceof Map ? Object.fromEntries(value) : value), 2));
  if (!result.preflight.ok || result.aborted) process.exitCode = 1;
}
// Only execute CLI when run directly (not when imported in tests)
if (process.argv[1] && String(process.argv[1]).includes("cli-gate2-recovery")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
