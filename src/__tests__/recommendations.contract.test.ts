import { describe, expect, it } from "vitest";
import type { RecommendationCandidate } from "@/lib/recommendations/contract";
import { rankRecommendations } from "@/lib/recommendations/ranking";

const now = new Date("2026-08-25T00:00:00.000Z");

function candidate(
  input: Partial<RecommendationCandidate> & Pick<RecommendationCandidate, "id" | "domain">,
): RecommendationCandidate {
  return {
    title: input.id,
    href: `/${input.domain.toLowerCase()}/${input.id}`,
    context: null,
    publishedAt: now,
    reasons: [{ signal: "REGION", label: "같은 지역" }],
    ...input,
  };
}

describe("S21 public recommendation contract", () => {
  it("ranks explainably by signal count, publication time, domain, and id", () => {
    const ranked = rankRecommendations([
      candidate({ id: "lease", domain: "LEASE" }),
      candidate({ id: "job-b", domain: "JOBS" }),
      candidate({ id: "job-a", domain: "JOBS" }),
      candidate({
        id: "strong",
        domain: "LEASE",
        reasons: [
          { signal: "REGION", label: "같은 지역" },
          { signal: "TONNAGE", label: "같은 톤수" },
        ],
      }),
      candidate({
        id: "old",
        domain: "JOBS",
        publishedAt: new Date("2026-01-01"),
      }),
    ]);

    expect(ranked.map((item) => item.id)).toEqual([
      "strong",
      "job-a",
      "job-b",
      "lease",
    ]);
    expect(ranked[0].reasons.map((reason) => reason.label)).toEqual([
      "같은 지역",
      "같은 톤수",
    ]);
  });

  it("drops unexplained candidates and enforces the requested result bound", () => {
    const ranked = rankRecommendations([
      candidate({ id: "hidden", domain: "JOBS", reasons: [] }),
      candidate({ id: "visible", domain: "LEASE" }),
    ], 1);
    expect(ranked.map((item) => item.id)).toEqual(["visible"]);
  });
});
