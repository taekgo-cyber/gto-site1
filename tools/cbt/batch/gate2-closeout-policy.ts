// Gate 2 Operational Closeout Policy — frozen bounded scope.
// This file is the source of truth for the operational closeout of the 50 Gate 2 candidates.
// Do not edit without gate approval; the canonical hashes must match the approved scope.

import {
  FROZEN_GATE_TARGET_COUNT,
  FROZEN_GATE_TARGET_HASH,
  FROZEN_GATE_TARGET_IDS,
} from "./gate2-frozen-gate";
import { hashTargetIds, type Gate2GeneratedQuestion } from "./gate2-state";
import {
  canonicalJsonString,
  sha256HexUpper,
} from "./gate2-integrity-evidence";

export const GATE2_OPERATIONAL_CLOSEOUT_VERSION = "gate2-operational-closeout-v1";

export const GATE2_OPERATIONAL_CLOSEOUT_PASS = "GATE2_OPERATIONAL_CLOSEOUT_PASS" as const;
export const GATE2_OPERATIONAL_CLOSEOUT_FAIL = "GATE2_OPERATIONAL_CLOSEOUT_FAIL" as const;

export type Gate2OperationalCloseoutDecision =
  | typeof GATE2_OPERATIONAL_CLOSEOUT_PASS
  | typeof GATE2_OPERATIONAL_CLOSEOUT_FAIL;

export const GATE2_BASE_SYSTEM_DECISION = "FAIL" as const;

export const GATE2_CLOSEOUT_TOTAL = 50;
export const GATE2_CLOSEOUT_LATEST_COUNT = 50;
export const GATE2_CLOSEOUT_TERMINAL_COUNT = 0;
export const GATE2_CLOSEOUT_INCOMPLETE_COUNT = 0;
export const GATE2_CLOSEOUT_QA_PASSED_COUNT = 39;
export const GATE2_CLOSEOUT_QA_FAILED_COUNT = 6;
export const GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT = 5;
export const GATE2_CLOSEOUT_RESOLVED_COUNT = 45;
export const GATE2_CLOSEOUT_COVERAGE_RATIO =
  GATE2_CLOSEOUT_RESOLVED_COUNT / GATE2_CLOSEOUT_TOTAL; // 0.9
export const GATE2_CLOSEOUT_SEMANTIC_PASS_RATIO =
  GATE2_CLOSEOUT_QA_PASSED_COUNT / GATE2_CLOSEOUT_RESOLVED_COUNT; // 39/45

export const GATE2_CLOSEOUT_AUDIT_ERRORS = 0;
export const GATE2_CLOSEOUT_AUDIT_WARNINGS = 0;

export const GATE2_CLOSEOUT_EXCLUDED_COUNT = 5;
export const GATE2_CLOSEOUT_EXCLUDED_RATIO = 0.1;
export const GATE2_CLOSEOUT_ALLOWED_EXCLUDED_REASONS = ["server_error", "timeout"] as const;
export const GATE2_CLOSEOUT_CIRCUIT_OPEN_COUNT = 0;
export const GATE2_CLOSEOUT_PROMOTE_ELIGIBILITY = false;

export type Gate2CloseoutExcludedEntry = {
  candidateId: string;
  generatedQuestionId: string;
  status: "FAILED";
  errorCode: "server_error" | "timeout";
};

export const GATE2_CLOSEOUT_EXCLUDED_ENTRIES: readonly Gate2CloseoutExcludedEntry[] = [
  {
    candidateId: "cmssx5bty004ojsro4q0cze45",
    generatedQuestionId: "cmt4bx1hq000408roa2888zqg",
    status: "FAILED",
    errorCode: "server_error",
  },
  {
    candidateId: "cmssx5ezl0054jsrownj322a9",
    generatedQuestionId: "cmt4c1qgh000508roice9lvas",
    status: "FAILED",
    errorCode: "server_error",
  },
  {
    candidateId: "cmssx5fs20058jsroovx4dfes",
    generatedQuestionId: "cmt3oevqt000xkcrorj7fuk1u",
    status: "FAILED",
    errorCode: "server_error",
  },
  {
    candidateId: "cmssx591v004ajsrolrw32sfz",
    generatedQuestionId: "cmt3ouics001hkcro1w02q2fm",
    status: "FAILED",
    errorCode: "timeout",
  },
  {
    candidateId: "cmssx60jj0084jsroyo72x002",
    generatedQuestionId: "cmt3p2asu001kkcroyrbbhr1d",
    status: "FAILED",
    errorCode: "timeout",
  },
] as const;

export const GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_IDS: readonly string[] =
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES.map((e) => e.candidateId);

export const GATE2_CLOSEOUT_EXCLUDED_GENERATED_QUESTION_IDS: readonly string[] =
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES.map((e) => e.generatedQuestionId);

export const GATE2_CLOSEOUT_EXCLUDED_GENERATED_QUESTION_LOOKUP = new Map(
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES.map((e) => [e.generatedQuestionId, e]),
);

// Approved canonical hashes. The candidate-only hash is hashTargetIds over the exact excluded order.
export const GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH =
  "CBA301B81B479C65FEC95FC536112A0C12D2792B757280EF55941218E9A21B33";
// The full excluded object array hash (canonical JSON over the entries above).
export const GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH =
  "834FD3520523CE46DD1B7B20B335E92F64CF55AEBCEF2DE527D24C5AC471F754";

export const GATE2_CLOSEOUT_EXCLUDED_LOOKUP = new Map<
  string,
  Gate2CloseoutExcludedEntry
>(GATE2_CLOSEOUT_EXCLUDED_ENTRIES.map((e) => [e.candidateId, e]));

export function isGate2CloseoutExcludedCandidate(candidateId: string): boolean {
  return GATE2_CLOSEOUT_EXCLUDED_LOOKUP.has(candidateId);
}

export function getGate2CloseoutExcludedEntry(
  candidateId: string,
): Gate2CloseoutExcludedEntry | undefined {
  return GATE2_CLOSEOUT_EXCLUDED_LOOKUP.get(candidateId);
}

export function isGate2CloseoutExcludedGeneratedQuestionId(
  generatedQuestionId: string,
): boolean {
  return GATE2_CLOSEOUT_EXCLUDED_GENERATED_QUESTION_LOOKUP.has(generatedQuestionId);
}

export function isGate2CloseoutExcludedErrorCode(
  errorCode: string | null | undefined,
): boolean {
  return (
    errorCode !== null &&
    errorCode !== undefined &&
    (GATE2_CLOSEOUT_ALLOWED_EXCLUDED_REASONS as readonly string[]).includes(errorCode)
  );
}

export function isGate2CloseoutTargetCandidate(candidateId: string): boolean {
  return FROZEN_GATE_TARGET_IDS.includes(candidateId);
}

export function validateGate2CloseoutTargetIdentity(
  targetIds: readonly string[],
): string | null {
  if (targetIds.length !== FROZEN_GATE_TARGET_COUNT) {
    return `target count mismatch: expected ${FROZEN_GATE_TARGET_COUNT} got ${targetIds.length}`;
  }
  if (hashTargetIds(targetIds) !== FROZEN_GATE_TARGET_HASH) {
    return `gate target hash mismatch: expected ${FROZEN_GATE_TARGET_HASH}`;
  }
  if (new Set(targetIds).size !== targetIds.length) {
    return "target duplicate detected";
  }
  const sortedActual = [...targetIds].sort();
  const sortedFrozen = [...FROZEN_GATE_TARGET_IDS].sort();
  if (
    sortedActual.length !== sortedFrozen.length ||
    !sortedActual.every((id, i) => id === sortedFrozen[i])
  ) {
    return "target IDs mismatch frozen gate set";
  }
  return null;
}

export function getLatestStatusOfCandidate(
  candidateId: string,
  latestByCandidate: ReadonlyMap<string, Gate2GeneratedQuestion>,
): { id: string | null; status: string | null; errorCode: string | null } {
  const latest = latestByCandidate.get(candidateId);
  return {
    id: latest?.id ?? null,
    status: latest?.status ?? null,
    errorCode: latest?.errorCode ?? null,
  };
}

// ---------------------------------------------------------------------------
// Runtime invariants — fail closed if the constants are tampered.
// ---------------------------------------------------------------------------

if (GATE2_CLOSEOUT_EXCLUDED_ENTRIES.length !== GATE2_CLOSEOUT_EXCLUDED_COUNT) {
  throw new Error(
    `excluded count mismatch: expected ${GATE2_CLOSEOUT_EXCLUDED_COUNT} got ${GATE2_CLOSEOUT_EXCLUDED_ENTRIES.length}`,
  );
}

if (hashTargetIds(GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_IDS) !== GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH) {
  throw new Error(
    `excluded candidate hash mismatch: expected ${GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH}`,
  );
}

if (
  sha256HexUpper(canonicalJsonString(GATE2_CLOSEOUT_EXCLUDED_ENTRIES)) !==
  GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH
) {
  throw new Error(
    `excluded object hash mismatch: expected ${GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH}`,
  );
}

if (GATE2_CLOSEOUT_TOTAL !== FROZEN_GATE_TARGET_COUNT) {
  throw new Error(
    `closeout total mismatch frozen gate count: ${GATE2_CLOSEOUT_TOTAL} vs ${FROZEN_GATE_TARGET_COUNT}`,
  );
}

if (
  GATE2_CLOSEOUT_QA_PASSED_COUNT +
    GATE2_CLOSEOUT_QA_FAILED_COUNT +
    GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT !==
  GATE2_CLOSEOUT_TOTAL
) {
  throw new Error("closeout counts do not sum to total");
}

if (
  GATE2_CLOSEOUT_RESOLVED_COUNT !==
  GATE2_CLOSEOUT_QA_PASSED_COUNT + GATE2_CLOSEOUT_QA_FAILED_COUNT
) {
  throw new Error("resolved count mismatch");
}

if (GATE2_CLOSEOUT_TERMINAL_COUNT !== 0 || GATE2_CLOSEOUT_INCOMPLETE_COUNT !== 0) {
  throw new Error("terminal/incomplete must be zero for operational closeout");
}

// Excluded entries must be a subset of the frozen Gate 2 targets.
for (const entry of GATE2_CLOSEOUT_EXCLUDED_ENTRIES) {
  if (!isGate2CloseoutTargetCandidate(entry.candidateId)) {
    throw new Error(
      `excluded candidate ${entry.candidateId} is not a frozen Gate 2 target`,
    );
  }
}

// Excluded error codes must be allowed.
for (const entry of GATE2_CLOSEOUT_EXCLUDED_ENTRIES) {
  if (!isGate2CloseoutExcludedErrorCode(entry.errorCode)) {
    throw new Error(
      `excluded entry ${entry.candidateId} has disallowed error code ${entry.errorCode}`,
    );
  }
}
