import { describe, expect, it } from "vitest";
import { assertLocalCorrectionBoundary, correctedContent } from "../apply-corrections";
import { CBT_LAUNCH_CONTENT_CORRECTIONS } from "../corrections";

describe("CBT launch content correction contract", () => {
  it("locks unique exact targets and source identities", () => {
    expect(CBT_LAUNCH_CONTENT_CORRECTIONS).toHaveLength(18);
    expect(new Set(CBT_LAUNCH_CONTENT_CORRECTIONS.map((item) => item.masterQuestionId)).size).toBe(18);
    expect(new Set(CBT_LAUNCH_CONTENT_CORRECTIONS.map((item) => `${item.masterQuestionId}:${item.sourceQuestionId}`)).size).toBe(18);
  });

  it("applies exact-before patches and fails closed on stale content", () => {
    const correction = CBT_LAUNCH_CONTENT_CORRECTIONS.find(
      (item) => item.masterQuestionId === "cmtgeuu1x001748rodt6g63o1",
    );
    expect(correction).toBeDefined();
    const current = {
      questionText: "Which of the following is NOT one of the three attitudes toward one's occupation?",
      choices: [
        { index: 1, text: "애정" },
        { index: 2, text: "긍지" },
        { index: 3, text: "열정" },
        { index: 4, text: "항명" },
      ],
      explanation: "The three attitudes toward one's occupation are 애정, 긍지, and 열정. Therefore, 항명 is not one of them.",
    };
    const result = correctedContent(current, correction!);
    expect(result.questionText).toBe("다음 중 직업에 대한 세 가지 태도에 해당하지 않는 것은?");
    expect(result.explanation).toContain("항명은 이에 해당하지 않습니다");
    expect(() => correctedContent({ ...current, questionText: "stale" }, correction!)).toThrow(
      "cbt_content_correction_question_before_mismatch",
    );
  });

  it("permits loopback local postgres and rejects production/non-loopback", () => {
    expect(
      assertLocalCorrectionBoundary({ DATABASE_URL: "postgresql://u:p@localhost:5432/gto_site", NODE_ENV: "test" } as NodeJS.ProcessEnv).hostname,
    ).toBe("localhost");
    expect(() =>
      assertLocalCorrectionBoundary({ DATABASE_URL: "postgresql://u:p@localhost:5432/gto_site", NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow("cbt_content_correction_production_forbidden");
    expect(() =>
      assertLocalCorrectionBoundary({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/gto", NODE_ENV: "test" } as NodeJS.ProcessEnv),
    ).toThrow("cbt_content_correction_loopback_required");
  });
});
