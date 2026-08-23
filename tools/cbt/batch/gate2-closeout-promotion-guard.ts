// Gate 2-derived promotion guard — minimal, bounded, non-global.
// - Only blocks promotion paths that are derived entirely from the frozen Gate 2 50 candidates.
// - Unrelated/future promotion paths (residual 13, current pool 63, bulk) are not required to provide a closeout artifact.
// - The guard is evaluated before any DB write. It never calls providers or performs mutations.

import { FROZEN_GATE_TARGET_IDS } from "./gate2-frozen-gate";
import { isGate2CloseoutTargetCandidate } from "./gate2-closeout-policy";
import { verifyCloseoutEvidence } from "./gate2-closeout-evidence";

export type Gate2PromotionGuardDeps = {
  /** Path to a closeout manifest file (closeout-manifest.json) */
  gate2CloseoutManifestPath?: string;
  /** run log directory for bound recovery history verification (default data/cbt/runs) */
  runLogDir?: string;
};

export function isGate2DerivedPromotionFromCandidateIds(
  candidateIds: readonly (string | null | undefined)[],
): boolean {
  const valid = candidateIds.filter((c): c is string => typeof c === "string" && c.length > 0);
  if (valid.length === 0) return false;
  return valid.every((c) => isGate2CloseoutTargetCandidate(c));
}

export async function requireGate2CloseoutManifestForGate2DerivedPromotion(
  candidateIds: readonly (string | null | undefined)[],
  generatedQuestionIds: readonly (string | null | undefined)[],
  deps: Gate2PromotionGuardDeps,
): Promise<void> {
  if (!isGate2DerivedPromotionFromCandidateIds(candidateIds)) {
    return;
  }
  if (!deps.gate2CloseoutManifestPath) {
    throw new Error(
      "Gate2-derived promotion blocked: a closeout manifest is required for the frozen Gate 2 scope. " +
        "Provide --gate2-closeout-manifest=<path> or ensure the promotion is not Gate2-derived.",
    );
  }
  const validCandidates = candidateIds.filter((c): c is string => typeof c === "string" && c.length > 0);
  const validGeneratedQuestionIds = generatedQuestionIds.filter((g): g is string => typeof g === "string" && g.length > 0);
  const verify = await verifyCloseoutEvidence({
    manifestPath: deps.gate2CloseoutManifestPath,
    runLogDir: deps.runLogDir,
    candidateIds: validCandidates,
    generatedQuestionIds: validGeneratedQuestionIds,
  });
  if (!verify.valid) {
    throw new Error(
      `Gate2-derived promotion blocked: closeout evidence verification failed: ${verify.reason}`,
    );
  }
}
