import { describe, expect, it } from "vitest";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  laneEntries,
  loadAndVerifyResidualR1,
  verifyAppendOnly,
  verifyFrozenAgainstLive,
} from "../residual-13-evidence";

const R1 = path.resolve("data/cbt/evidence/residual-13/residual-r1-ab55d9b7f4c3");

describe("residual-13 evidence boundary", () => {
  it("loads the immutable R1 freeze and exact lanes", async () => {
    const binding = await loadAndVerifyResidualR1(R1);
    expect(binding.entryCount).toBe(13);
    expect(laneEntries(binding, "TRANSIENT")).toHaveLength(9);
    expect(laneEntries(binding, "SEMANTIC")).toHaveLength(4);
  });

  it("fails closed when an R1 artifact is tampered", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "residual-r1-tamper-"));
    try {
      await cp(R1, dir, { recursive: true });
      const file = path.join(dir, "residual-frozen.json");
      const raw = await readFile(file, "utf8");
      await writeFile(file, `${raw}\n`, "utf8");
      await expect(loadAndVerifyResidualR1(dir)).rejects.toThrow(/hash mismatch/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects stale latest state", async () => {
    const binding = await loadAndVerifyResidualR1(R1);
    const entries = binding.entries.map((entry, index) => index === 0 ? { ...entry, latestStatus: "QA_FAILED" as const } : entry);
    const result = verifyFrozenAgainstLive(binding, {
      capturedAt: new Date().toISOString(),
      entries,
      candidateCount: 13,
      generatedQuestionCount: 13,
      qaCount: 7,
      candidateFingerprints: {},
      historicalGqFingerprints: {},
      historicalQaFingerprints: {},
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("latestStatus");
  });

  it("detects historical mutation, deletion, and unexpected append", () => {
    const before = [{ id: "g1", candidateId: "c1", fingerprint: "a" }];
    const after = [
      { id: "g1", candidateId: "c1", fingerprint: "b" },
      { id: "g2", candidateId: "other", fingerprint: "x" },
    ];
    const deleted = verifyAppendOnly(before, [], [], [], ["c1"]);
    expect(deleted.ok).toBe(false);
    const changed = verifyAppendOnly(before, after, [], [], ["c1"]);
    expect(changed.ok).toBe(false);
    expect(changed.mutatedIds).toContain("gq:g1");
    expect(changed.unexpectedCandidateIds).toContain("gq:g2");
  });
});
