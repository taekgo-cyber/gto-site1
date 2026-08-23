import { describe, expect, it } from "vitest";
import { loadAndVerifyResidualR1, type ResidualLiveSnapshot } from "../residual-13-evidence";
import { EXECUTE_CONFIRMATION_TOKEN, runResidual13 } from "../residual-13-runner";

const request = (lane: "TRANSIENT" | "SEMANTIC", mode: "preflight" | "dry-run" | "execute") => ({
  lane,
  mode,
  concurrency: 1 as const,
  attemptBudgetPerCandidate: 1 as const,
  expectedProvider: "zen" as const,
  expectedModel: "deepseek-v4-flash" as const,
  expectedGenerationPromptVersion: "step8-question-gen-v1.1" as const,
  expectedQaPromptVersion: "step8-auto-qa-v3.1" as const,
  ...(mode === "execute" ? { confirmationToken: EXECUTE_CONFIRMATION_TOKEN } : {}),
});

async function bindingAndLive(): Promise<{ binding: Awaited<ReturnType<typeof loadAndVerifyResidualR1>>; live: ResidualLiveSnapshot }> {
  const binding = await loadAndVerifyResidualR1();
  return {
    binding,
    live: {
      capturedAt: new Date().toISOString(),
      entries: binding.entries,
      candidateCount: 13,
      generatedQuestionCount: 13,
      qaCount: 7,
      candidateFingerprints: {},
      historicalGqFingerprints: {},
      historicalQaFingerprints: {},
    },
  };
}

describe("residual-13 runner", () => {
  it("preflight is provider-free and returns exact Lane A targets", async () => {
    const { binding, live } = await bindingAndLive();
    const result = await runResidual13(request("TRANSIENT", "preflight"), { binding, liveSnapshot: live });
    expect(result.targets).toHaveLength(9);
    expect(result.attemptedCount).toBe(0);
    expect(result.resolutionComplete).toBe(false);
  });

  it("dry-run is provider-free and returns exact Lane B targets", async () => {
    const { binding, live } = await bindingAndLive();
    const result = await runResidual13(request("SEMANTIC", "dry-run"), { binding, liveSnapshot: live });
    expect(result.targets).toHaveLength(4);
    expect(result.items.every((item) => item.attempted === false)).toBe(true);
  });

  it("rejects config drift and execute without confirmation", async () => {
    const { binding } = await bindingAndLive();
    await expect(runResidual13({ ...request("TRANSIENT", "preflight"), concurrency: 2 as unknown as 1 }, { binding })).rejects.toThrow(/concurrency/);
    await expect(runResidual13({ ...request("TRANSIENT", "execute"), confirmationToken: "wrong" }, { binding })).rejects.toThrow(/confirmation/);
  });

  it("execute requires an injected executor and classifies quarantine without calling a provider in tests", async () => {
    const { binding, live } = await bindingAndLive();
    await expect(runResidual13(request("SEMANTIC", "execute"), { binding, liveSnapshot: live })).rejects.toThrow(/executor/);
    let calls = 0;
    const result = await runResidual13(request("SEMANTIC", "execute"), {
      binding,
      liveSnapshot: live,
      executor: {
        async run() {
          calls += 1;
          return { generatedQuestionId: `new-${calls}`, qaId: `qa-${calls}`, status: "QA_FAILED" as const };
        },
      },
    });
    expect(calls).toBe(4);
    expect(result.quarantinedCount).toBe(4);
    expect(result.resolutionComplete).toBe(true);
  });
});
