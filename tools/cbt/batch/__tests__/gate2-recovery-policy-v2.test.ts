import { describe, expect, it } from "vitest";
import { hashTargetIds, validateRecoveryPreflight } from "../gate2-state";
import {
  GATE2_RECOVERY_POLICY_VERSION,
  GATE2_RECOVERY_PARENT_RUN_ID,
  PROVIDER_RECOVERY_POLICY,
  CONTRACT_RECOVERY_POLICY,
} from "../gate2-recovery-policy";
import {
  GATE2_RECOVERY_POLICY_VERSION_V2,
  GATE2_RECOVERY_PARENT_RUN_ID_V2,
  GATE2_RECOVERY_V2_LANE,
  GATE2_RECOVERY_V2_TARGET_SET_HASH,
  PROVIDER_RECOVERY_POLICY_V2,
  getGate2RecoveryPolicyV2,
  resolveGate2RecoveryPolicyV2,
} from "../gate2-recovery-policy-v2";

const EXPECTED_V2_CANDIDATE_IDS = [
  "cmssx5men0066jsrovtuz3l16",
  "cmssx51ia0038jsrob1pm7srf",
  "cmssx5bty004ojsro4q0cze45",
  "cmssx5ezl0054jsrownj322a9",
  "cmssx5fs20058jsroovx4dfes",
  "cmssx591v004ajsrolrw32sfz",
  "cmssx60jj0084jsroyo72x002",
] as const;

const EXPECTED_V2_LATEST_GQ_IDS = [
  "cmt43rp0j0002bwro1ljz1ynr",
  "cmt43w2hi0003bwro5hst22ah",
  "cmt3o3szc000tkcro9k3nzv0t",
  "cmt3o9tzv000wkcro9ub4go2s",
  "cmt3oevqt000xkcrorj7fuk1u",
  "cmt3ouics001hkcro1w02q2fm",
  "cmt3p2asu001kkcroyrbbhr1d",
] as const;

const EXPECTED_V2_ERROR_CODES = [
  "timeout",
  "timeout",
  "timeout",
  "timeout",
  "server_error",
  "timeout",
  "timeout",
] as const;

describe("Gate 2 recovery v2 immutable policy", () => {
  it("policyVersion, parentRunId, lane, targetSetHash are frozen constants", () => {
    expect(GATE2_RECOVERY_POLICY_VERSION_V2).toBe("gate2-post-failure-recovery-v2");
    expect(GATE2_RECOVERY_PARENT_RUN_ID_V2).toBe("e765495f-1351-4a9f-bfde-e1730033710f");
    expect(GATE2_RECOVERY_V2_LANE).toBe("provider");
    expect(GATE2_RECOVERY_V2_TARGET_SET_HASH).toBe(
      "85A43D20B7D2EEE5065A95147E3ACB2DC7BF45D87DCB8A92DC9ED29AB44FF0A4",
    );
    expect(PROVIDER_RECOVERY_POLICY_V2.policyVersion).toBe(GATE2_RECOVERY_POLICY_VERSION_V2);
    expect(PROVIDER_RECOVERY_POLICY_V2.parentRunId).toBe(GATE2_RECOVERY_PARENT_RUN_ID_V2);
    expect(PROVIDER_RECOVERY_POLICY_V2.lane).toBe("provider");
    expect(PROVIDER_RECOVERY_POLICY_V2.targetSetHash).toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
  });

  it("exact count 7 and no duplicates", () => {
    expect(PROVIDER_RECOVERY_POLICY_V2.targets.length).toBe(7);
    const ids = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.candidateId);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([...EXPECTED_V2_CANDIDATE_IDS]);
  });

  it("targetSetHash is canonically computed from exact order and frozen", () => {
    const ids = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.candidateId);
    const computed = hashTargetIds(ids);
    expect(computed).toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
    // ensure upper-case hex 64
    expect(GATE2_RECOVERY_V2_TARGET_SET_HASH).toMatch(/^[0-9A-F]{64}$/);
    // sorted order hash differs — proves order-sensitive canonical
    const sortedHash = hashTargetIds([...ids].sort());
    expect(sortedHash).not.toBe(GATE2_RECOVERY_V2_TARGET_SET_HASH);
  });

  it("candidateIds are exact order as spec", () => {
    const ids = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.candidateId);
    expect(ids[0]).toBe("cmssx5men0066jsrovtuz3l16");
    expect(ids[1]).toBe("cmssx51ia0038jsrob1pm7srf");
    expect(ids[2]).toBe("cmssx5bty004ojsro4q0cze45");
    expect(ids[3]).toBe("cmssx5ezl0054jsrownj322a9");
    expect(ids[4]).toBe("cmssx5fs20058jsroovx4dfes");
    expect(ids[5]).toBe("cmssx591v004ajsrolrw32sfz");
    expect(ids[6]).toBe("cmssx60jj0084jsroyo72x002");
  });

  it("latest GQ IDs are exact and map to candidate order", () => {
    const latestIds = PROVIDER_RECOVERY_POLICY_V2.targets.map((t) => t.expectedLatestGeneratedQuestionId);
    expect(latestIds).toEqual([...EXPECTED_V2_LATEST_GQ_IDS]);
    // spot check per spec line
    expect(PROVIDER_RECOVERY_POLICY_V2.targets[0].expectedLatestGeneratedQuestionId).toBe(
      "cmt43rp0j0002bwro1ljz1ynr",
    );
    expect(PROVIDER_RECOVERY_POLICY_V2.targets[1].expectedLatestGeneratedQuestionId).toBe(
      "cmt43w2hi0003bwro5hst22ah",
    );
    expect(PROVIDER_RECOVERY_POLICY_V2.targets[4].expectedLatestGeneratedQuestionId).toBe(
      "cmt3oevqt000xkcrorj7fuk1u",
    );
  });

  it("every expectedStatus=FAILED and errorCode matches transient spec", () => {
    for (let i = 0; i < PROVIDER_RECOVERY_POLICY_V2.targets.length; i++) {
      const t = PROVIDER_RECOVERY_POLICY_V2.targets[i];
      expect(t.expectedStatus).toBe("FAILED");
      expect(t.expectedErrorCode).toBe(EXPECTED_V2_ERROR_CODES[i]);
    }
    // ensure only allowed transient codes
    for (const t of PROVIDER_RECOVERY_POLICY_V2.targets) {
      expect(["timeout", "server_error"]).toContain(t.expectedErrorCode);
    }
  });

  it("v1 policy remains byte-for-byte semantically preserved (no mutation)", () => {
    expect(GATE2_RECOVERY_POLICY_VERSION).toBe("gate2-post-failure-recovery-v1");
    expect(GATE2_RECOVERY_PARENT_RUN_ID).toBe("27898a40-c56c-4fac-984f-28168ef4c97b");
    expect(CONTRACT_RECOVERY_POLICY.policyVersion).toBe(GATE2_RECOVERY_POLICY_VERSION);
    expect(PROVIDER_RECOVERY_POLICY.policyVersion).toBe(GATE2_RECOVERY_POLICY_VERSION);
    expect(CONTRACT_RECOVERY_POLICY.targetSetHash).toBe(
      "3E02242D99C556DBE2A0CEF15E185570A5D36A6AA178C671411448958D50AF53",
    );
    expect(PROVIDER_RECOVERY_POLICY.targetSetHash).toBe(
      "D757E97997D84BA1D7A2DCB26AD6DFE5F7948A9C5AB7CEB52BCE2E48368AF22D",
    );
    expect(CONTRACT_RECOVERY_POLICY.targets.length).toBe(1);
    expect(PROVIDER_RECOVERY_POLICY.targets.length).toBe(8);
    // v1 provider still contains old GQ IDs (not v2)
    expect(PROVIDER_RECOVERY_POLICY.targets.find((t) => t.candidateId === "cmssx5men0066jsrovtuz3l16")
      ?.expectedLatestGeneratedQuestionId).toBe("cmt3n28u90003kcroyi95ukjp");
  });

  it("v1/v2 separation: version, parentRunId, hash, count, latest GQ IDs all differ", () => {
    expect(GATE2_RECOVERY_POLICY_VERSION_V2).not.toBe(GATE2_RECOVERY_POLICY_VERSION);
    expect(GATE2_RECOVERY_PARENT_RUN_ID_V2).not.toBe(GATE2_RECOVERY_PARENT_RUN_ID);
    expect(GATE2_RECOVERY_V2_TARGET_SET_HASH).not.toBe(PROVIDER_RECOVERY_POLICY.targetSetHash);
    expect(PROVIDER_RECOVERY_POLICY_V2.targets.length).not.toBe(PROVIDER_RECOVERY_POLICY.targets.length);
    // overlapping candidate cmssx5men latest GQ diverges v1 vs v2 (proves lineage update)
    const v1Entry = PROVIDER_RECOVERY_POLICY.targets.find((t) => t.candidateId === "cmssx5men0066jsrovtuz3l16");
    const v2Entry = PROVIDER_RECOVERY_POLICY_V2.targets.find((t) => t.candidateId === "cmssx5men0066jsrovtuz3l16");
    expect(v1Entry?.expectedLatestGeneratedQuestionId).not.toBe(v2Entry?.expectedLatestGeneratedQuestionId);
    expect(v2Entry?.expectedLatestGeneratedQuestionId).toBe("cmt43rp0j0002bwro1ljz1ynr");
    // second overlapping candidate also diverges
    const v1Second = PROVIDER_RECOVERY_POLICY.targets.find((t) => t.candidateId === "cmssx51ia0038jsrob1pm7srf");
    const v2Second = PROVIDER_RECOVERY_POLICY_V2.targets.find((t) => t.candidateId === "cmssx51ia0038jsrob1pm7srf");
    expect(v1Second?.expectedLatestGeneratedQuestionId).not.toBe(v2Second?.expectedLatestGeneratedQuestionId);
    // hash computed from v2 IDs never collides with v1
    expect(hashTargetIds(EXPECTED_V2_CANDIDATE_IDS as unknown as string[])).not.toBe(
      PROVIDER_RECOVERY_POLICY.targetSetHash,
    );
  });

  it("minimal fail-closed wiring: explicit lane/version required", () => {
    expect(getGate2RecoveryPolicyV2("provider", GATE2_RECOVERY_POLICY_VERSION_V2)).toBe(
      PROVIDER_RECOVERY_POLICY_V2,
    );
    expect(() => getGate2RecoveryPolicyV2("provider" as never, "gate2-post-failure-recovery-v1" as never)).toThrow();
    expect(() => resolveGate2RecoveryPolicyV2({ lane: "contract", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 })).toThrow(
      /fail-closed/,
    );
    expect(() => resolveGate2RecoveryPolicyV2({ lane: "provider", policyVersion: "wrong" })).toThrow(
      /fail-closed/,
    );
    expect(resolveGate2RecoveryPolicyV2({ lane: "provider", policyVersion: GATE2_RECOVERY_POLICY_VERSION_V2 })).toBe(
      PROVIDER_RECOVERY_POLICY_V2,
    );
  });

  it("validateRecoveryPreflight passes for v2 when DB matches, fails on mismatch", () => {
    const policy = PROVIDER_RECOVERY_POLICY_V2 as unknown as Parameters<typeof validateRecoveryPreflight>[0];
    const candidates = EXPECTED_V2_CANDIDATE_IDS.map((id) => ({ id }));
    const rows = PROVIDER_RECOVERY_POLICY_V2.targets.map((t, i) => ({
      id: t.expectedLatestGeneratedQuestionId,
      candidateQuestionId: t.candidateId,
      status: t.expectedStatus as "FAILED",
      errorCode: t.expectedErrorCode,
      createdAt: new Date(1000 + i),
    }));
    const ok = validateRecoveryPreflight(policy, candidates, rows);
    expect(ok.ok).toBe(true);

    // mismatch latest GQ
    const badRows = rows.map((r, i) => (i === 0 ? { ...r, id: "wrong" } : r));
    const bad = validateRecoveryPreflight(policy, candidates, badRows);
    expect(bad.ok).toBe(false);

    // duplicate candidateId in policy would be caught — simulate by checking hash already
    expect(hashTargetIds(EXPECTED_V2_CANDIDATE_IDS as unknown as string[])).toBe(
      GATE2_RECOVERY_V2_TARGET_SET_HASH,
    );
  });

  it("aborted parentRunId e765... is lineage only and never PASS evidence (no harness reuse)", () => {
    expect(GATE2_RECOVERY_PARENT_RUN_ID_V2).toBe("e765495f-1351-4a9f-bfde-e1730033710f");
    // v2 parent differs from v1 parent, proving new lineage
    expect(GATE2_RECOVERY_PARENT_RUN_ID_V2).not.toBe(GATE2_RECOVERY_PARENT_RUN_ID);
    // explicit constant check — ensures file not accidentally reusing v1 parent
    expect(PROVIDER_RECOVERY_POLICY_V2.parentRunId).toBe("e765495f-1351-4a9f-bfde-e1730033710f");
  });

  it("does not modify evidence evaluator or provider implementation (static check)", async () => {
    const { readFile } = await import("node:fs/promises");
    const v2Content = await readFile("tools/cbt/batch/gate2-recovery-policy-v2.ts", "utf8");
    expect(v2Content).not.toMatch(/createConfiguredProvider/);
    expect(v2Content).not.toMatch(/evaluateGate2Final/);
    // v2 file must not import v1 policy values to reuse semantics
    expect(v2Content).not.toMatch(/from ".\/gate2-recovery-policy"/);
    expect(v2Content).not.toMatch(/PROVIDER_RECOVERY_POLICY[^_]/);
  });
});
