// Gate 2 POST-FAILURE RECOVERY v1의 고정 대상. 이 파일의 변경은 새 policy 승인 대상이다.
export const GATE2_RECOVERY_POLICY_VERSION = "gate2-post-failure-recovery-v1";
export const GATE2_RECOVERY_PARENT_RUN_ID = "27898a40-c56c-4fac-984f-28168ef4c97b";

export type RecoveryLane = "contract" | "provider";
export type RecoveryTarget = {
  candidateId: string;
  expectedLatestGeneratedQuestionId: string;
  expectedStatus: "FAILED";
  expectedErrorCode: "schema_validation_failed" | "timeout" | "server_error";
};

export type Gate2RecoveryPolicy = {
  policyVersion: typeof GATE2_RECOVERY_POLICY_VERSION;
  parentRunId: typeof GATE2_RECOVERY_PARENT_RUN_ID;
  lane: RecoveryLane;
  targetSetHash: string;
  targets: readonly RecoveryTarget[];
};

export const CONTRACT_RECOVERY_POLICY: Gate2RecoveryPolicy = {
  policyVersion: GATE2_RECOVERY_POLICY_VERSION,
  parentRunId: GATE2_RECOVERY_PARENT_RUN_ID,
  lane: "contract",
  targetSetHash: "3E02242D99C556DBE2A0CEF15E185570A5D36A6AA178C671411448958D50AF53",
  targets: [
    { candidateId: "cmssx5rie006ujsroeow4yz85", expectedLatestGeneratedQuestionId: "cmt3oij170012kcro3unfplpe", expectedStatus: "FAILED", expectedErrorCode: "schema_validation_failed" },
  ],
};

export const PROVIDER_RECOVERY_POLICY: Gate2RecoveryPolicy = {
  policyVersion: GATE2_RECOVERY_POLICY_VERSION,
  parentRunId: GATE2_RECOVERY_PARENT_RUN_ID,
  lane: "provider",
  targetSetHash: "D757E97997D84BA1D7A2DCB26AD6DFE5F7948A9C5AB7CEB52BCE2E48368AF22D",
  targets: [
    { candidateId: "cmssx4s4m001wjsrojuubfwm8", expectedLatestGeneratedQuestionId: "cmt3muqgj0000kcrokfwg3f4t", expectedStatus: "FAILED", expectedErrorCode: "server_error" },
    { candidateId: "cmssx5men0066jsrovtuz3l16", expectedLatestGeneratedQuestionId: "cmt3n28u90003kcroyi95ukjp", expectedStatus: "FAILED", expectedErrorCode: "timeout" },
    { candidateId: "cmssx51ia0038jsrob1pm7srf", expectedLatestGeneratedQuestionId: "cmt3nsko3000mkcrodgaj2ac2", expectedStatus: "FAILED", expectedErrorCode: "timeout" },
    { candidateId: "cmssx5bty004ojsro4q0cze45", expectedLatestGeneratedQuestionId: "cmt3o3szc000tkcro9k3nzv0t", expectedStatus: "FAILED", expectedErrorCode: "timeout" },
    { candidateId: "cmssx5ezl0054jsrownj322a9", expectedLatestGeneratedQuestionId: "cmt3o9tzv000wkcro9ub4go2s", expectedStatus: "FAILED", expectedErrorCode: "timeout" },
    { candidateId: "cmssx5fs20058jsroovx4dfes", expectedLatestGeneratedQuestionId: "cmt3oevqt000xkcrorj7fuk1u", expectedStatus: "FAILED", expectedErrorCode: "server_error" },
    { candidateId: "cmssx591v004ajsrolrw32sfz", expectedLatestGeneratedQuestionId: "cmt3ouics001hkcro1w02q2fm", expectedStatus: "FAILED", expectedErrorCode: "timeout" },
    { candidateId: "cmssx60jj0084jsroyo72x002", expectedLatestGeneratedQuestionId: "cmt3p2asu001kkcroyrbbhr1d", expectedStatus: "FAILED", expectedErrorCode: "timeout" },
  ],
};

export function getGate2RecoveryPolicy(lane: RecoveryLane): Gate2RecoveryPolicy {
  return lane === "contract" ? CONTRACT_RECOVERY_POLICY : PROVIDER_RECOVERY_POLICY;
}
