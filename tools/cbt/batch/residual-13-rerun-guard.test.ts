import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadAndVerifyResidualR1 } from "./residual-13-evidence";
import {
  assertLaneARerunEvidence,
  authorizeLaneARerun,
  R11F_EVIDENCE_SHA256,
  RERUN_AUTHORIZATION_TOKEN,
} from "./residual-13-rerun-guard";
import type { LaneAForensicSummary } from "./residual-13-uncertain-evidence";

const R1 = path.resolve("data/cbt/evidence/residual-13/residual-r1-ab55d9b7f4c3");
const R11F_JSON = path.resolve(
  "data/cbt/evidence/residual-13/lane-a-execution-uncertain-a7dac798a71c/lane-a-execution-uncertain.json",
);

async function fixture() {
  const binding = await loadAndVerifyResidualR1(R1);
  const evidence = JSON.parse(await readFile(R11F_JSON, "utf8"));
  return { binding, evidence };
}

const cleanForensic: LaneAForensicSummary = {
  exact9TotalGQ: 9,
  baselineGQCount: 9,
  newGQCount: 0,
  newQACount: 0,
  candidatesWithNewGQ: [],
  candidatesWithNewGQButNoQA: [],
  candidateContamination: 0,
  gate50Contamination: 0,
};

describe("R12 Lane A rerun guard", () => {
  it("authorizes only the exact existing R11F evidence artifact", async () => {
    const { binding, evidence } = await fixture();
    await expect(authorizeLaneARerun({
      binding,
      evidenceDirectory: path.dirname(R11F_JSON),
      authorization: RERUN_AUTHORIZATION_TOKEN,
    })).resolves.toMatchObject({
      evidenceDirectory: path.dirname(R11F_JSON),
      targetIds: evidence.candidateIds,
    });
  });

  it("accepts the exact R11F evidence contract", async () => {
    const { binding, evidence } = await fixture();
    expect(() => assertLaneARerunEvidence({
      binding,
      evidence,
      evidenceSha256: R11F_EVIDENCE_SHA256,
      sidecarSha256: R11F_EVIDENCE_SHA256,
      authorization: RERUN_AUTHORIZATION_TOKEN,
    })).not.toThrow();
  });

  it("rejects missing or wrong evidence paths before any rerun path can proceed", async () => {
    const { binding } = await fixture();
    await expect(authorizeLaneARerun({ binding, authorization: RERUN_AUTHORIZATION_TOKEN })).rejects.toThrow(/evidence directory is required/);
    await expect(authorizeLaneARerun({ binding, evidenceDirectory: path.resolve("data/cbt/evidence/wrong"), authorization: RERUN_AUTHORIZATION_TOKEN })).rejects.toThrow(/unexpected R11F evidence path/);
  });

  it.each([
    ["missing authorization", undefined],
    ["wrong authorization", "WRONG"],
  ])("rejects %s", async (_label, authorization) => {
    const { binding, evidence } = await fixture();
    expect(() => assertLaneARerunEvidence({ binding, evidence, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: authorization ?? undefined })).toThrow(/authorization/);
  });

  it("rejects missing or wrong evidence SHA", async () => {
    const { binding, evidence } = await fixture();
    expect(() => assertLaneARerunEvidence({ binding, evidence, evidenceSha256: "BAD", sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/SHA256/);
    expect(() => assertLaneARerunEvidence({ binding, evidence, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: "BAD", authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/SHA256/);
  });

  it("rejects target hash, R1, forensic, and semantic drift", async () => {
    const { binding, evidence } = await fixture();
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, targetSetHash: "BAD" }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/target hash/);
    expect(() => assertLaneARerunEvidence({ binding: { ...binding, frozenHash: "BAD" }, evidence, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/R1 frozen/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, forensic: { ...cleanForensic, newGQCount: 1 } }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/new GQ/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, forensic: { ...cleanForensic, newQACount: 1 } }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/new QA/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, forensic: { ...cleanForensic, candidateContamination: 1 } }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/candidate contamination/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, forensic: { ...cleanForensic, gate50Contamination: 1 } }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/Gate50/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, attempted: true }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/attempted/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: { ...evidence, rerunAllowed: true }, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/rerunAllowed/);
  });

  it("rejects missing, partial, and extra target sets", async () => {
    const { binding, evidence } = await fixture();
    const partial = { ...evidence, candidateIds: evidence.candidateIds.slice(1) };
    const extra = { ...evidence, candidateIds: [...evidence.candidateIds, "extra-target"] };
    expect(() => assertLaneARerunEvidence({ binding, evidence: partial, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/target set/);
    expect(() => assertLaneARerunEvidence({ binding, evidence: extra, evidenceSha256: R11F_EVIDENCE_SHA256, sidecarSha256: R11F_EVIDENCE_SHA256, authorization: RERUN_AUTHORIZATION_TOKEN })).toThrow(/target set/);
  });
});
