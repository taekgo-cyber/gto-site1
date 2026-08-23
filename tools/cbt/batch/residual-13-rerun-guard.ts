import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type ResidualFreezeBinding,
} from "./residual-13-evidence";
import {
  assertLaneATarget,
  assertR1Binding,
  evidencePaths,
  LANE_A_TARGET_SET_HASH,
  UNCERTAIN_EVIDENCE_ROOT,
  verifyUncertainEvidence,
  type LaneAUncertainEvidence,
} from "./residual-13-uncertain-evidence";

export const RERUN_AUTHORIZATION_TOKEN =
  "AUTHORIZE_LANE_A_RERUN_AFTER_EXECUTION_UNCERTAINTY";
export const R11F_EVIDENCE_SHA256 =
  "4B0D8CAB50891EB6180771880E2BF6753C2DDD84C1AEDAEA79E4C735315CF0D4";

export type LaneARerunAuthorization = {
  evidenceDirectory: string;
  targetIds: readonly string[];
  evidence: LaneAUncertainEvidence;
};

function sha256Upper(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();
}

function fail(message: string): never {
  throw new Error(`Lane A rerun guard: ${message}`);
}

function assertExactEvidence(
  evidence: LaneAUncertainEvidence,
  binding: ResidualFreezeBinding,
  evidenceSha256: string,
  sidecarSha256: string,
  authorization: string | undefined,
): void {
  if (authorization !== RERUN_AUTHORIZATION_TOKEN) {
    fail("explicit rerun authorization is required");
  }
  assertR1Binding(binding);
  const targets = assertLaneATarget(binding);
  if (JSON.stringify(evidence.candidateIds) !== JSON.stringify(targets)) {
    fail("evidence target set does not match the frozen Lane A target set");
  }
  if (evidence.targetSetHash !== LANE_A_TARGET_SET_HASH) {
    fail("evidence target hash mismatch");
  }
  if (evidenceSha256 !== R11F_EVIDENCE_SHA256 || sidecarSha256 !== R11F_EVIDENCE_SHA256) {
    fail("R11F evidence SHA256 mismatch");
  }
  if (evidence.outcome !== "QUARANTINED_EXECUTION_UNCERTAIN") {
    fail("unexpected uncertainty outcome");
  }
  if (evidence.attempted !== "UNKNOWN") {
    fail("attempted semantics must remain UNKNOWN");
  }
  if (evidence.logicalAttemptCount !== "UNKNOWN") {
    fail("logicalAttemptCount semantics must remain UNKNOWN");
  }
  if (evidence.providerCall !== "UNKNOWN") {
    fail("providerCall semantics must remain UNKNOWN");
  }
  if (evidence.dbWrite !== 0) fail("dbWrite semantics must remain 0");
  if (evidence.rerunAllowed !== false) fail("historical rerunAllowed must remain false");
  if (evidence.humanReviewEligible !== false) fail("human review must remain ineligible");
  if (evidence.promoteEligible !== false) fail("promotion must remain ineligible");
  if (evidence.forensic.newGQCount !== 0) fail("new GQ forensic invariant failed");
  if (evidence.forensic.newQACount !== 0) fail("new QA forensic invariant failed");
  if (evidence.forensic.candidateContamination !== 0) fail("candidate contamination invariant failed");
  if (evidence.forensic.gate50Contamination !== 0) fail("Gate50 contamination invariant failed");
}

export function assertLaneARerunEvidence(options: {
  evidence: LaneAUncertainEvidence;
  binding: ResidualFreezeBinding;
  evidenceSha256: string;
  sidecarSha256: string;
  authorization?: string;
}): void {
  assertExactEvidence(
    options.evidence,
    options.binding,
    options.evidenceSha256,
    options.sidecarSha256,
    options.authorization,
  );
}

export async function authorizeLaneARerun(options: {
  binding: ResidualFreezeBinding;
  evidenceDirectory?: string;
  authorization?: string;
}): Promise<LaneARerunAuthorization> {
  if (options.authorization !== RERUN_AUTHORIZATION_TOKEN) {
    fail("explicit rerun authorization is required");
  }
  if (!options.evidenceDirectory) fail("R11F evidence directory is required");

  const expected = evidencePaths();
  const expectedDirectory = path.resolve(expected.directory);
  const requestedDirectory = path.resolve(options.evidenceDirectory);
  if (requestedDirectory !== expectedDirectory) {
    fail(`unexpected R11F evidence path; expected ${expectedDirectory}`);
  }
  if (path.resolve(UNCERTAIN_EVIDENCE_ROOT) !== path.dirname(expectedDirectory)) {
    fail("uncertain evidence root identity mismatch");
  }

  const binding = options.binding;
  const evidence = await verifyUncertainEvidence(requestedDirectory, binding);
  const raw = await readFile(expected.jsonPath, "utf8");
  const sidecar = await readFile(expected.sha256Path, "utf8");
  const evidenceSha256 = sha256Upper(raw);
  const sidecarSha256 = sidecar.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  assertExactEvidence(evidence, binding, evidenceSha256, sidecarSha256, options.authorization);

  return {
    evidenceDirectory: requestedDirectory,
    targetIds: evidence.candidateIds,
    evidence,
  };
}
