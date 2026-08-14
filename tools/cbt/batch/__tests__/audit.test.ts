/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { hasErrors, runDatasetAudit } from "../audit";
import { createFakeBatchContentDb } from "./fakeContentStore";

/** 정상 Master + 연결 체인을 만든다 */
function seedHealthyMaster(
  fake: ReturnType<typeof createFakeBatchContentDb>,
  overrides: { gqStatus?: string; masterOverrides?: Record<string, unknown> } = {},
) {
  fake.helpers.seedCandidate({ id: "c1" });
  const gq = fake.helpers.seedGenerated({
    id: `gq_${fake.store.generatedQuestions.length + 1}`,
    status: overrides.gqStatus ?? "APPROVED",
    candidateQuestionId: "cq_c1",
  });
  fake.store.masterQuestions.push({
    id: `master_${fake.store.masterQuestions.length + 1}`,
    generatedQuestionId: gq.id,
    category: "CAT-HANDLING",
    questionText: "화물 적재 시 올바른 방법은?",
    choices: [
      { index: 1, text: "A" },
      { index: 2, text: "B" },
      { index: 3, text: "C" },
      { index: 4, text: "D" },
    ],
    answers: [2],
    explanation: "설명",
    difficulty: "MEDIUM",
    isActive: true,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides.masterOverrides,
  });
  return gq;
}

describe("runDatasetAudit", () => {
  it("정상 dataset → findings 0, 집계 정확", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake);

    const report = await runDatasetAudit(fake.auditDb);

    expect(report.totalMasters).toBe(1);
    expect(report.byCategory["CAT-HANDLING"]).toBe(1);
    expect(report.byDifficulty["MEDIUM"]).toBe(1);
    expect(report.findings).toHaveLength(0);
    expect(hasErrors(report)).toBe(false);
  });

  it("orphan Master → Generated → error", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    // Master만 있고 GeneratedQuestion 없음
    fake.store.masterQuestions.push({
      id: "master_orphan",
      generatedQuestionId: "gq_missing",
      category: "CAT-HANDLING",
      questionText: "질문",
      choices: [{ index: 1, text: "A" }],
      answers: [1],
      difficulty: "MEDIUM",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "orphan_master_generated",
      ),
    ).toBe(true);
    expect(hasErrors(report)).toBe(true);
  });

  it("state violation (Master 원본이 APPROVED 아님) → error", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake, { gqStatus: "QA_PASSED" });

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "state_violation",
      ),
    ).toBe(true);
  });

  it("orphan Generated → Candidate → error", async () => {
    const fake = createFakeBatchContentDb();
    // Generated에 없는 candidate 참조
    const gq = fake.helpers.seedGenerated({
      id: "gq_1",
      status: "APPROVED",
      candidateQuestionId: "cq_missing",
    });
    fake.store.masterQuestions.push({
      id: "master_1",
      generatedQuestionId: gq.id,
      category: "CAT-HANDLING",
      questionText: "질문",
      choices: [{ index: 1, text: "A" }],
      answers: [1],
      difficulty: "MEDIUM",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "orphan_generated_candidate",
      ),
    ).toBe(true);
  });

  it("빈 questionText → error", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake, { masterOverrides: { questionText: "  " } });

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "empty_question_text",
      ),
    ).toBe(true);
  });

  it("choices 3개(비표준) + 빈 text → error", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake, {
      masterOverrides: {
        choices: [
          { index: 1, text: "A" },
          { index: 2, text: "" },
          { index: 3, text: "C" },
        ],
      },
    });

    const report = await runDatasetAudit(fake.auditDb);
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("choices_invalid");
    expect(hasErrors(report)).toBe(true);
  });

  it("answers 범위 밖 → error", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake, { masterOverrides: { answers: [5] } });

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "answers_invalid",
      ),
    ).toBe(true);
  });

  it("answers 중복 → error", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake, { masterOverrides: { answers: [2, 2] } });

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "answers_invalid",
      ),
    ).toBe(true);
  });

  it("duplicate generatedQuestionId → error", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedCandidate({ id: "c1" });
    fake.helpers.seedGenerated({ id: "gq_1", status: "APPROVED" });
    fake.store.masterQuestions.push(
      {
        id: "master_1",
        generatedQuestionId: "gq_1",
        category: "CAT-HANDLING",
        questionText: "질문",
        choices: [{ index: 1, text: "A" }],
        answers: [1],
        difficulty: "MEDIUM",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "master_2",
        generatedQuestionId: "gq_1",
        category: "CAT-HANDLING",
        questionText: "질문2",
        choices: [{ index: 1, text: "B" }],
        answers: [1],
        difficulty: "MEDIUM",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "error" && f.code === "duplicate_generated_question",
      ),
    ).toBe(true);
  });

  it("provenance 공백(originalUrl 없음) → warning만 (exit 0)", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake);
    fake.store.candidates[0].originalUrl = null;

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "warning" && f.code === "provenance_no_original_url",
      ),
    ).toBe(true);
    expect(hasErrors(report)).toBe(false);
  });

  it("이미지 무결성: src/resolvedSrc 모두 비어있으면 warning", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake);
    fake.store.candidates[0].images = [{ src: null, resolvedSrc: null }];

    const report = await runDatasetAudit(fake.auditDb);
    expect(
      report.findings.some(
        (f) => f.level === "warning" && f.code === "image_integrity",
      ),
    ).toBe(true);
    expect(hasErrors(report)).toBe(false);
  });

  it("승격 누락: APPROVED인데 Master 없음 집계", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake);
    fake.helpers.seedGenerated({ id: "gq_2", status: "APPROVED" });

    const report = await runDatasetAudit(fake.auditDb);
    expect(report.approvedNotPromoted).toBe(1);
  });

  it("audit은 read-only: 쓰기 메서드가 일절 호출되지 않는다", async () => {
    const fake = createFakeBatchContentDb();
    seedHealthyMaster(fake);

    // 모든 쓰기 메서드를 throw로 대체해도 audit이 성공해야 한다
    const contentDb = fake.contentDb;
    const breaker = () => {
      throw new Error("WRITE CALLED");
    };
    const saved = {
      gqUpdate: contentDb.generatedQuestion.update,
      gqCreate: contentDb.generatedQuestion.create,
      mqCreate: contentDb.masterQuestion.create,
      qaCreate: contentDb.generatedQuestionQA.create,
    };
    (contentDb.generatedQuestion as any).update = breaker;
    (contentDb.generatedQuestion as any).create = breaker;
    (contentDb.masterQuestion as any).create = breaker;
    (contentDb.generatedQuestionQA as any).create = breaker;

    const report = await runDatasetAudit(fake.auditDb);
    expect(Array.isArray(report.findings)).toBe(true);

    (contentDb.generatedQuestion as any).update = saved.gqUpdate;
    (contentDb.generatedQuestion as any).create = saved.gqCreate;
    (contentDb.masterQuestion as any).create = saved.mqCreate;
    (contentDb.generatedQuestionQA as any).create = saved.qaCreate;
  });
});