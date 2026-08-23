// Gate 2 POST-FAILURE RECOVERY v2 — provider lane immutable/versioned policy.
// - exact 7 latest transient targets (timeout/server_error) at freeze point
// - parentRunId=e765495f-1351-4a9f-bfde-e1730033710f is lineage only; this aborted run is never PASS evidence
// - targetSetHash is canonically computed from the exact target order below and frozen
// - 이 파일의 변경은 새 policy 승인 대상이다. v1 파일( gate2-recovery-policy.ts )은 byte-for-byte 의미 보존.
// - evidence evaluator / provider 구현을 변경하지 않는다.
import { hashTargetIds } from "./gate2-state";

export const GATE2_RECOVERY_POLICY_VERSION_V2 = "gate2-post-failure-recovery-v2" as const;
export const GATE2_RECOVERY_PARENT_RUN_ID_V2 = "e765495f-1351-4a9f-bfde-e1730033710f" as const;
export const GATE2_RECOVERY_V2_LANE = "provider" as const;

// Canonical hash: hashTargetIds(exact target order). Frozen after computation.
// ids join("\n") + "\n" SHA-256 upper-case — same as gate2-state.hashTargetIds
export const GATE2_RECOVERY_V2_TARGET_SET_HASH =
  "85A43D20B7D2EEE5065A95147E3ACB2DC7BF45D87DCB8A92DC9ED29AB44FF0A4" as const;

export type RecoveryLaneV2 = "provider";
export type RecoveryTargetV2 = {
  candidateId: string;
  expectedLatestGeneratedQuestionId: string;
  expectedStatus: "FAILED";
  expectedErrorCode: "timeout" | "server_error";
};

export type Gate2RecoveryPolicyV2 = {
  policyVersion: typeof GATE2_RECOVERY_POLICY_VERSION_V2;
  parentRunId: typeof GATE2_RECOVERY_PARENT_RUN_ID_V2;
  lane: typeof GATE2_RECOVERY_V2_LANE;
  targetSetHash: typeof GATE2_RECOVERY_V2_TARGET_SET_HASH;
  targets: readonly RecoveryTargetV2[];
};

export const PROVIDER_RECOVERY_POLICY_V2: Gate2RecoveryPolicyV2 = {
  policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2,
  parentRunId: GATE2_RECOVERY_PARENT_RUN_ID_V2,
  lane: GATE2_RECOVERY_V2_LANE,
  targetSetHash: GATE2_RECOVERY_V2_TARGET_SET_HASH,
  targets: [
    {
      candidateId: "cmssx5men0066jsrovtuz3l16",
      expectedLatestGeneratedQuestionId: "cmt43rp0j0002bwro1ljz1ynr",
      expectedStatus: "FAILED",
      expectedErrorCode: "timeout",
    },
    {
      candidateId: "cmssx51ia0038jsrob1pm7srf",
      expectedLatestGeneratedQuestionId: "cmt43w2hi0003bwro5hst22ah",
      expectedStatus: "FAILED",
      expectedErrorCode: "timeout",
    },
    {
      candidateId: "cmssx5bty004ojsro4q0cze45",
      expectedLatestGeneratedQuestionId: "cmt3o3szc000tkcro9k3nzv0t",
      expectedStatus: "FAILED",
      expectedErrorCode: "timeout",
    },
    {
      candidateId: "cmssx5ezl0054jsrownj322a9",
      expectedLatestGeneratedQuestionId: "cmt3o9tzv000wkcro9ub4go2s",
      expectedStatus: "FAILED",
      expectedErrorCode: "timeout",
    },
    {
      candidateId: "cmssx5fs20058jsroovx4dfes",
      expectedLatestGeneratedQuestionId: "cmt3oevqt000xkcrorj7fuk1u",
      expectedStatus: "FAILED",
      expectedErrorCode: "server_error",
    },
    {
      candidateId: "cmssx591v004ajsrolrw32sfz",
      expectedLatestGeneratedQuestionId: "cmt3ouics001hkcro1w02q2fm",
      expectedStatus: "FAILED",
      expectedErrorCode: "timeout",
    },
    {
      candidateId: "cmssx60jj0084jsroyo72x002",
      expectedLatestGeneratedQuestionId: "cmt3p2asu001kkcroyrbbhr1d",
      expectedStatus: "FAILED",
      expectedErrorCode: "timeout",
    },
  ],
};

// ---------------------------------------------------------------------------
// Fail-closed invariants (immutable constants)
// ---------------------------------------------------------------------------
const _v2Ids = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.candidateId);
if (_v2Ids.length !== 7) {
  throw new Error(`v2 target count must be 7, got ${_v2Ids.length}`);
}
if (new Set(_v2Ids).size !== _v2Ids.length) {
  throw new Error("v2 target candidateId duplicate detected");
}
if (hashTargetIds(_v2Ids) !== GATE2_RECOVERY_V2_TARGET_SET_HASH) {
  throw new Error(
    `v2 targetSetHash mismatch: expected ${GATE2_RECOVERY_V2_TARGET_SET_HASH} got ${hashTargetIds(_v2Ids)}`,
  );
}

// Freeze for immutability (shallow; targets already readonly)
Object.freeze(PROVIDER_RECOVERY_POLICY_V2);
Object.freeze(PROVIDER_RECOVERY_POLICY_V2.targets);
for (const t of PROVIDER_RECOVERY_POLICY_V2.targets) Object.freeze(t);

// ---------------------------------------------------------------------------
// Minimal fail-closed selector for future safe execution
// - does not change provider/retry/timeout/backoff/circuit/kill-switch/concurrency
// - requires explicit policyVersion + lane; any mismatch throws
// ---------------------------------------------------------------------------
export function getGate2RecoveryPolicyV2(
  lane: RecoveryLaneV2,
  policyVersion: typeof GATE2_RECOVERY_POLICY_VERSION_V2,
): Gate2RecoveryPolicyV2 {
  if (lane !== GATE2_RECOVERY_V2_LANE) {
    throw new Error(`v2 lane must be "${GATE2_RECOVERY_V2_LANE}", got "${lane as string}"`);
  }
  if (policyVersion !== GATE2_RECOVERY_POLICY_VERSION_V2) {
    throw new Error(
      `v2 policyVersion must be "${GATE2_RECOVERY_POLICY_VERSION_V2}", got "${policyVersion as string}"`,
    );
  }
  return PROVIDER_RECOVERY_POLICY_V2;
}

/**
 * Explicit versioned resolver — fail-closed for any ambiguous or unknown selection.
 * Use when wiring future recovery execution must be explicit.
 */
export function resolveGate2RecoveryPolicyV2(selection: {
  lane: string;
  policyVersion: string;
}): Gate2RecoveryPolicyV2 {
  if (
    selection.lane !== GATE2_RECOVERY_V2_LANE ||
    selection.policyVersion !== GATE2_RECOVERY_POLICY_VERSION_V2
  ) {
    throw new Error(
      `fail-closed: unknown v2 selection lane=${selection.lane} policyVersion=${selection.policyVersion}`,
    );
  }
  return PROVIDER_RECOVERY_POLICY_V2;
}
