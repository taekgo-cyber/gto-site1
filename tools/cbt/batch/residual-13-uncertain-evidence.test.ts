import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertLaneATarget,
  assertR1Binding,
  buildUncertainEvidence,
  collectLaneAForensic,
  evidencePaths,
  forensicReasons,
  UNCERTAIN_CONFIRMATION_TOKEN,
  verifyUncertainEvidence,
  writeUncertainEvidence,
} from "./residual-13-uncertain-evidence";
import { laneEntries, loadAndVerifyResidualR1 } from "./residual-13-evidence";

const R1 = path.resolve("data/cbt/evidence/residual-13/residual-r1-ab55d9b7f4c3");

async function fixture() {
  const binding = await loadAndVerifyResidualR1(R1);
  const targets = [...assertLaneATarget(binding)];
  const entries = laneEntries(binding, "TRANSIENT");
  const gqRows = entries.map((entry) => ({ id: entry.latestGeneratedQuestionId, candidateQuestionId: entry.candidateId }));
  const qaRows = entries.flatMap((entry) => entry.latestQaId ? [{ id: entry.latestQaId, generatedQuestionId: entry.latestGeneratedQuestionId }] : []);
  const db = {
    candidateQuestion: { findMany: async () => targets.map((id) => ({ id })) },
    generatedQuestion: { findMany: async () => gqRows },
    generatedQuestionQA: { findMany: async () => qaRows },
  };
  const summary = await collectLaneAForensic(db, binding);
  return { binding, targets, gqRows, qaRows, db, summary };
}

describe("R10B Lane A execution-uncertain evidence", () => {
  it("passes the exact9 preflight fixture", async () => {
    const { summary } = await fixture();
    expect(summary).toEqual({
      exact9TotalGQ: 9,
      baselineGQCount: 9,
      newGQCount: 0,
      newQACount: 0,
      candidatesWithNewGQ: [],
      candidatesWithNewGQButNoQA: [],
      candidateContamination: 0,
      gate50Contamination: 0,
    });
    expect(forensicReasons(summary)).toEqual([]);
  });

  it("fails a target hash mismatch", async () => {
    const { binding, targets } = await fixture();
    const badBinding = { ...binding, entries: binding.entries.map((entry) => ({ ...entry })) };
    (badBinding.entries as Array<typeof binding.entries[number]>)[0] = {
      ...badBinding.entries[0],
      candidateId: `${targets[0]}-tampered`,
    };
    expect(() => assertLaneATarget(badBinding)).toThrow(/target hash mismatch/);
  });

  it("fails an R1 hash mismatch", async () => {
    const { binding } = await fixture();
    expect(() => assertR1Binding({ ...binding, frozenHash: "BAD" })).toThrow(/R1 frozen hash mismatch/);
  });

  it("fails NEW_GQ and NEW_QA forensic contamination", async () => {
    const { binding, db, gqRows, qaRows, targets } = await fixture();
    const contaminatedDb = {
      ...db,
      generatedQuestion: { findMany: async () => [...gqRows, { id: "new-gq", candidateQuestionId: targets[0] }] },
      generatedQuestionQA: { findMany: async () => [...qaRows, { id: "new-qa", generatedQuestionId: "new-gq" }] },
    };
    const summary = await collectLaneAForensic(contaminatedDb, binding);
    expect(forensicReasons(summary).join(" ")).toMatch(/newGQCount|newQACount/);
  });

  it("fails closed on evidence collision and wrong confirmation", async () => {
    const { binding, summary } = await fixture();
    const root = await mkdtemp(path.join(os.tmpdir(), "r10b-collision-"));
    try {
      const collision = evidencePaths(root).directory;
      await mkdir(collision, { recursive: true });
      await expect(writeUncertainEvidence({ binding, summary, confirmationToken: UNCERTAIN_CONFIRMATION_TOKEN, baseDir: root })).rejects.toThrow(/collision/);
      const freshRoot = await mkdtemp(path.join(os.tmpdir(), "r10b-confirmation-"));
      try {
        await expect(writeUncertainEvidence({ binding, summary, confirmationToken: "WRONG", baseDir: freshRoot })).rejects.toThrow(/exact quarantine confirmation token/);
      } finally {
        await rm(freshRoot, { recursive: true, force: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes and verifies exact uncertainty semantics", async () => {
    const { binding, summary } = await fixture();
    const root = await mkdtemp(path.join(os.tmpdir(), "r10b-schema-"));
    try {
      const written = await writeUncertainEvidence({ binding, summary, confirmationToken: UNCERTAIN_CONFIRMATION_TOKEN, baseDir: root, createdAt: "2026-08-23T16:00:00.000Z" });
      expect(written.evidence.attempted).toBe("UNKNOWN");
      expect(written.evidence.logicalAttemptCount).toBe("UNKNOWN");
      expect(written.evidence.providerCall).toBe("UNKNOWN");
      expect(written.evidence.dbWrite).toBe(0);
      expect(written.evidence.rerunAllowed).toBe(false);
      const verified = await verifyUncertainEvidence(written.directory, binding);
      expect(verified.outcome).toBe("QUARANTINED_EXECUTION_UNCERTAIN");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects tampered JSON and tampered sidecar hash", async () => {
    const { binding, summary } = await fixture();
    const root = await mkdtemp(path.join(os.tmpdir(), "r10b-tamper-"));
    try {
      const written = await writeUncertainEvidence({ binding, summary, confirmationToken: UNCERTAIN_CONFIRMATION_TOKEN, baseDir: root });
      const raw = await readFile(written.jsonPath, "utf8");
      await writeFile(written.jsonPath, raw.replace("UNKNOWN", "TRUE"), "utf8");
      await expect(verifyUncertainEvidence(written.directory, binding)).rejects.toThrow(/sidecar hash mismatch/);
      await writeFile(written.jsonPath, raw, "utf8");
      await writeFile(written.sha256Path, "BAD  lane-a-execution-uncertain.json\n", "utf8");
      await expect(verifyUncertainEvidence(written.directory, binding)).rejects.toThrow(/sidecar hash mismatch/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves Lane B outside this evidence boundary", async () => {
    const { binding } = await fixture();
    expect(laneEntries(binding, "SEMANTIC")).toHaveLength(4);
    expect(buildUncertainEvidence).toBeTypeOf("function");
  });
});
