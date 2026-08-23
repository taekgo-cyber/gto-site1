// Gate 2 latest-state evaluator. read-only diagnostic; append-only attestation은 별도 evidence가 필요해 기본 FAIL-closed다.
import "dotenv/config";
import { readIdsFile } from "./batch/args";
import { hasErrors, runDatasetAudit } from "./batch/audit";
import { evaluateGate2Final, type Gate2IntegrityEvidence } from "./batch/gate2-final-evaluator";
import { selectLatestGeneratedQuestions } from "./batch/gate2-state";
import { verifyEvidenceAtPath } from "./batch/gate2-integrity-evidence";
import { readRunLog } from "./batch/runlog";

function getOpt(argv: string[], key: string): string | undefined {
  const idx = argv.findIndex((a) => a === `--${key}` || a.startsWith(`--${key}=`));
  if (idx === -1) return undefined;
  const arg = argv[idx];
  if (arg.includes("=")) return arg.split("=").slice(1).join("=");
  const next = argv[idx + 1];
  if (next && !next.startsWith("--")) return next;
  return "";
}

async function buildRelevantRuns(evidence: Gate2IntegrityEvidence, runLogDir: string) {
  const runs: { runId: string; complete: boolean; aborted: boolean; circuitOpenCount: number }[] = [];
  for (const runId of evidence.relevantRunIds) {
    try {
      const log = await readRunLog(runLogDir, runId);
      const complete = log.runEnd !== null;
      const aborted = log.runEnd?.aborted === true;
      // circuit_open count: count item_result with detail circuit_open? simplified: check entries for circuit_open
      const circuitOpenCount = log.entries.filter((e) => (e as { detail?: string }).detail === "circuit_open").length;
      runs.push({ runId, complete, aborted, circuitOpenCount });
    } catch {
      runs.push({ runId, complete: false, aborted: true, circuitOpenCount: 1 });
    }
  }
  return runs;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const evidencePath = getOpt(argv, "evidence");
  const runIdOpt = getOpt(argv, "run-id") ?? getOpt(argv, "runId");
  const runLogDir = getOpt(argv, "run-log-dir") ?? "data/cbt/runs";

  const targetIds = await readIdsFile("docs/cbt/gate2-targets.txt");
  const mod = await import("@/lib/prisma");
  const rows = await mod.prisma.generatedQuestion.findMany({
    where: { candidateQuestionId: { in: targetIds } },
    select: { id: true, candidateQuestionId: true, status: true, errorCode: true, createdAt: true },
  });
  const audit = await runDatasetAudit();

  let integrityEvidence: Gate2IntegrityEvidence | undefined = undefined;
  let relevantRuns: { runId: string; complete: boolean; aborted: boolean; circuitOpenCount: number }[] = [];

  if (evidencePath) {
    const verified = await verifyEvidenceAtPath(evidencePath, { runLogDir });
    if (verified.valid && verified.evidence) {
      // if --run-id specified, require evidence relevantRunIds includes it; otherwise fail closed
      if (runIdOpt) {
        if (!verified.evidence.relevantRunIds.includes(runIdOpt)) {
          // tampered or mismatched runId -> invalid evidence, do not PASS
          integrityEvidence = undefined;
        } else {
          integrityEvidence = verified.evidence;
          relevantRuns = await buildRelevantRuns(integrityEvidence, runLogDir);
        }
      } else {
        integrityEvidence = verified.evidence;
        relevantRuns = await buildRelevantRuns(integrityEvidence, runLogDir);
      }
    } else {
      // invalid/tampered evidence never PASS — keep integrityEvidence undefined
      integrityEvidence = undefined;
      if (verified.reason) console.error(`evidence invalid: ${verified.reason}`);
    }
  } else {
    // no evidence: preserve fail-closed
    // --run-id without evidence must fail closed (never retroactively certify aborted run)
    if (runIdOpt) {
      // explicitly do not try to build evidence from runId alone; fail closed
      integrityEvidence = undefined;
      relevantRuns = [];
      console.error(`--run-id requires --evidence with valid binding; fail-closed`);
    }
  }

  const result = evaluateGate2Final({
    targetIds,
    latestByCandidate: selectLatestGeneratedQuestions(rows),
    relevantRuns,
    datasetAuditPassed: !hasErrors(audit),
    ...(integrityEvidence ? { integrityEvidence } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
  // PASS only if evaluator says PASS and evidence was valid; otherwise exit 1
  process.exitCode = result.decision === "PASS" ? 0 : 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
