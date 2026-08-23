import { describe, expect, it } from "vitest";
import {
  GATE2_BASE_SYSTEM_DECISION,
  GATE2_OPERATIONAL_CLOSEOUT_PASS,
  GATE2_OPERATIONAL_CLOSEOUT_FAIL,
  GATE2_CLOSEOUT_TOTAL,
  GATE2_CLOSEOUT_QA_PASSED_COUNT,
  GATE2_CLOSEOUT_QA_FAILED_COUNT,
  GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT,
  GATE2_CLOSEOUT_EXCLUDED_COUNT,
  GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH,
  GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH,
  GATE2_CLOSEOUT_EXCLUDED_ENTRIES,
  GATE2_CLOSEOUT_PROMOTE_ELIGIBILITY,
  isGate2CloseoutExcludedCandidate,
  getGate2CloseoutExcludedEntry,
  isGate2CloseoutExcludedErrorCode,
  validateGate2CloseoutTargetIdentity,
} from "../gate2-closeout-policy";
import { FROZEN_GATE_TARGET_IDS, FROZEN_GATE_TARGET_HASH } from "../gate2-frozen-gate";
import { hashTargetIds } from "../gate2-state";
import { canonicalJsonString, sha256HexUpper } from "../gate2-integrity-evidence";

describe("gate2-closeout-policy constants", () => {
  it("exposes the approved baseSystemDecision = FAIL", () => {
    expect(GATE2_BASE_SYSTEM_DECISION).toBe("FAIL");
  });

  it("exposes PASS/FAIL operational decision strings", () => {
    expect(GATE2_OPERATIONAL_CLOSEOUT_PASS).toBe("GATE2_OPERATIONAL_CLOSEOUT_PASS");
    expect(GATE2_OPERATIONAL_CLOSEOUT_FAIL).toBe("GATE2_OPERATIONAL_CLOSEOUT_FAIL");
  });

  it("frozen counts match the approved scope", () => {
    expect(GATE2_CLOSEOUT_TOTAL).toBe(50);
    expect(GATE2_CLOSEOUT_QA_PASSED_COUNT).toBe(39);
    expect(GATE2_CLOSEOUT_QA_FAILED_COUNT).toBe(6);
    expect(GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT).toBe(5);
    expect(GATE2_CLOSEOUT_QA_PASSED_COUNT + GATE2_CLOSEOUT_QA_FAILED_COUNT + GATE2_CLOSEOUT_TRANSIENT_FAILED_COUNT).toBe(50);
    expect(GATE2_CLOSEOUT_EXCLUDED_COUNT).toBe(5);
  });

  it("excluded candidate hash matches approved canonical hash", () => {
    const ids = GATE2_CLOSEOUT_EXCLUDED_ENTRIES.map((e) => e.candidateId);
    expect(hashTargetIds(ids)).toBe(GATE2_CLOSEOUT_EXCLUDED_CANDIDATE_HASH);
  });

  it("excluded object hash matches approved canonical hash", () => {
    const hash = sha256HexUpper(canonicalJsonString(GATE2_CLOSEOUT_EXCLUDED_ENTRIES));
    expect(hash).toBe(GATE2_CLOSEOUT_EXCLUDED_OBJECT_HASH);
  });

  it("excluded entries are a subset of frozen Gate 2 targets", () => {
    for (const entry of GATE2_CLOSEOUT_EXCLUDED_ENTRIES) {
      expect(FROZEN_GATE_TARGET_IDS).toContain(entry.candidateId);
    }
  });

  it("excluded reasons are only server_error or timeout", () => {
    for (const entry of GATE2_CLOSEOUT_EXCLUDED_ENTRIES) {
      expect(isGate2CloseoutExcludedErrorCode(entry.errorCode)).toBe(true);
    }
  });

  it("promote eligibility is false for the closeout scope", () => {
    expect(GATE2_CLOSEOUT_PROMOTE_ELIGIBILITY).toBe(false);
  });

  it("lookup helpers return the correct excluded entries", () => {
    const entry = GATE2_CLOSEOUT_EXCLUDED_ENTRIES[0];
    expect(isGate2CloseoutExcludedCandidate(entry.candidateId)).toBe(true);
    expect(getGate2CloseoutExcludedEntry(entry.candidateId)).toEqual(entry);
    expect(isGate2CloseoutExcludedCandidate("not-in-set")).toBe(false);
    expect(getGate2CloseoutExcludedEntry("not-in-set")).toBeUndefined();
  });

  it("validates frozen target identity", () => {
    expect(validateGate2CloseoutTargetIdentity([...FROZEN_GATE_TARGET_IDS])).toBeNull();
    expect(validateGate2CloseoutTargetIdentity([...FROZEN_GATE_TARGET_IDS].slice(1))).not.toBeNull();
  });

  it("rejects reordered target ids as different hash", () => {
    const reversed = [...FROZEN_GATE_TARGET_IDS].reverse();
    expect(hashTargetIds(reversed)).not.toBe(FROZEN_GATE_TARGET_HASH);
    expect(validateGate2CloseoutTargetIdentity(reversed)).not.toBeNull();
  });
});
