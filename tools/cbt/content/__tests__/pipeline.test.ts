import { describe, expect, it } from "vitest";
import { runContentProduction } from "../pipeline";
import { MockLlmProvider, type MockScript } from "../provider/mock";
import { MOCK_GENERATED_QUESTION, MOCK_QA_PASS } from "../provider";
import { createFakeContentDb } from "./fakeContentDb";
import type { GeneratedQuestionLlmOutput, QaLlmOutput } from "../schemas";
import { fullCriteria } from "./helpers";
import { reviewGeneratedQuestion } from "../review";
import { promoteToMaster } from "../promotion";

function makeCandidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    sourceName: "NEWBT-HWMUL",
    sourceQuestionId: "92628",
    originalUrl: "https://newbt.kr/문제/92628",
    rawHtmlSnippetId: "snippet-abc",
    ...overrides,
  };
}

function happyScript(): MockScript {
  return [
    { kind: "normal", data: MOCK_GENERATED_QUESTION },
    { kind: "normal", data: MOCK_QA_PASS },
  ];
}

describe("STEP 8 Golden Path", () => {
  it("A. 정상 Mock generation → QA_PASSED, QA 기록 저장", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider(happyScript());

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("QA_PASSED");
    expect(result.qaPassed).toBe(true);
    expect(result.qaFailed).toBe(false);
    expect(result.errorCode).toBeNull();
    expect(typeof result.similarityScore).toBe("number");

    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq).toBeDefined();
    expect(gq.status).toBe("QA_PASSED");
    expect(gq.candidateQuestionId).toBe("cq_c1");
    expect(gq.questionText).toBe(MOCK_GENERATED_QUESTION.questionText);
    expect(gq.rawLlmResponse).toEqual(MOCK_GENERATED_QUESTION);
    expect(gq.provider).toBe("mock");
    expect(gq.promptVersion).toBe("step8-question-gen-v1.1");
    expect(gq.similarityWarning).toBe(false);

    const qaRows = fake.store.qaRecords.filter(
      (r) => r.generatedQuestionId === result.generatedQuestionId,
    );
    expect(qaRows).toHaveLength(1);
    expect(qaRows[0].isPass).toBe(true);
    expect(qaRows[0].errorCode).toBeNull();
  });

  it("G. append-only: 같은 candidateId 재실행 → 새 행 생성 (덮어쓰기 금지)", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider(happyScript());

    const r1 = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );
    const provider2 = new MockLlmProvider(happyScript());
    const r2 = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider: provider2 },
    );

    expect(r1.generatedQuestionId).not.toBe(r2.generatedQuestionId);
    expect(fake.store.generatedQuestions).toHaveLength(2);
    const ids = new Set(fake.store.generatedQuestions.map((r) => r.id));
    expect(ids.size).toBe(2);
  });

  it("I. provenance: Master → Generated → Candidate → source 역추적", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider(happyScript());

    const generated = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );
    expect(generated.status).toBe("QA_PASSED");

    const reviewed = await reviewGeneratedQuestion(
      fake.db,
      generated.generatedQuestionId,
      "approve",
      "human-1",
    );
    expect(reviewed.status).toBe("APPROVED");

    const promoted = await promoteToMaster(fake.db, generated.generatedQuestionId);
    expect(promoted.created).toBe(true);

    const master = fake.store.masterQuestions.find(
      (r) => r.id === promoted.masterQuestionId,
    );
    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === master.generatedQuestionId,
    );
    const candidate = fake.store.candidates.find(
      (r) => r.id === gq.candidateQuestionId,
    );

    expect(master.generatedQuestionId).toBe(gq.id);
    expect(master.questionText).toBe(gq.questionText);
    expect(master.category).toBe(gq.category);
    expect(candidate.sourceName).toBe("NEWBT-HWMUL");
    expect(candidate.sourceQuestionId).toBe("92628");
    expect(candidate.originalUrl).toBe("https://newbt.kr/문제/92628");
    expect(candidate.fetchedAt).toBeInstanceOf(Date);
    expect(candidate.rawHtmlSnippetId).toBe("snippet-abc");
  });
});

describe("STEP 8 실패 Golden Path (No Drop)", () => {
  it("B. malformed JSON → FAILED + rawLlmResponse 보존", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider({ kind: "malformed_json" });

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("malformed_json");

    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq.status).toBe("FAILED");
    expect(gq.errorCode).toBe("malformed_json");
    expect(gq.questionText).toBeNull();
  });

  it("C. timeout → FAILED + errorCode=timeout", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider({ kind: "timeout", delayMs: 1 });

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("timeout");
    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq.status).toBe("FAILED");
    expect(gq.provider).toBe("mock");
  });

  it("D. provider error → FAILED + errorCode=provider_error", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider({
      kind: "provider_error",
      message: "rate limited",
    });

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("provider_error");
    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq.errorMessage).toContain("rate limited");
  });

  it("E. hallucination QA 실패 → QA_FAILED + QA 기록(hasHallucination=true) 보존", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const hallucinationQa: QaLlmOutput = {
      criteria: fullCriteria(),
      hasHallucination: true,
      isCopyrightSafe: false,
      criticalFlaws: ["원문에 없는 사실이 포함됨"],
      pass: false,
    };
    const provider = new MockLlmProvider([
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: hallucinationQa },
    ]);

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("QA_FAILED");
    expect(result.qaFailed).toBe(true);
    expect(result.qaPassed).toBe(false);

    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq.status).toBe("QA_FAILED");
    expect(gq.questionText).toBe(MOCK_GENERATED_QUESTION.questionText); // 생성본은 보존

    const qaRows = fake.store.qaRecords.filter(
      (r) => r.generatedQuestionId === result.generatedQuestionId,
    );
    expect(qaRows).toHaveLength(1);
    expect(qaRows[0].hasHallucination).toBe(true);
    expect(qaRows[0].isPass).toBe(false);
  });

  it("E2. AI가 pass=true여도 criticalFlaws가 있으면 강제 QA_FAILED (결함 방어)", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const fakePass: QaLlmOutput = {
      criteria: fullCriteria(),
      hasHallucination: false,
      isCopyrightSafe: true,
      criticalFlaws: ["정답이 사실과 다름"],
      pass: true, // AI가 pass라고 해도 결함이 있으면 실패 처리
    };
    const provider = new MockLlmProvider([
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "normal", data: fakePass },
    ]);

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );
    expect(result.status).toBe("QA_FAILED");
  });

  it("F. invalid answer (복수 정답) → FAILED + errorCode=content_invalid, raw 보존", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const badQuestion: GeneratedQuestionLlmOutput = {
      ...MOCK_GENERATED_QUESTION,
      answers: [1, 2],
    };
    const provider = new MockLlmProvider({ kind: "normal", data: badQuestion });

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("content_invalid");
    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq.rawLlmResponse).toEqual(badQuestion);
    expect(gq.errorMessage).toContain("single_answer_required");
  });

  it("F2. invalid answer (범위 밖 index) → schema_validation_failed (zod가 1~4 강제)", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const badQuestion: GeneratedQuestionLlmOutput = {
      ...MOCK_GENERATED_QUESTION,
      answers: [9],
    };
    const provider = new MockLlmProvider({ kind: "normal", data: badQuestion });

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("schema_validation_failed");
    const gq = fake.store.generatedQuestions.find(
      (r) => r.id === result.generatedQuestionId,
    );
    expect(gq.rawLlmResponse).toEqual(badQuestion);
  });

  it("QA LLM 실패(empty) → QA_FAILED + QA 오류 기록 보존", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider([
      { kind: "normal", data: MOCK_GENERATED_QUESTION },
      { kind: "empty_response" },
    ]);

    const result = await runContentProduction(
      { candidateId: "cq_c1" },
      { db: fake.db, provider },
    );

    expect(result.status).toBe("QA_FAILED");
    expect(result.errorCode).toBe("empty_response");
    const qaRows = fake.store.qaRecords.filter(
      (r) => r.generatedQuestionId === result.generatedQuestionId,
    );
    expect(qaRows).toHaveLength(1);
    expect(qaRows[0].errorCode).toBe("empty_response");
    expect(qaRows[0].isPass).toBeNull();
  });

  it("transaction rollback: QA 상태 반영 실패 시 QA 기록·상태 변경이 모두 롤백", async () => {
    const fake = createFakeContentDb();
    fake.helpers.seedCandidate(makeCandidateRow());
    const provider = new MockLlmProvider(happyScript());

    const originalUpdate = fake.db.generatedQuestion.update;
    (fake.db as unknown as { generatedQuestion: { update: unknown } }).generatedQuestion.update =
      async () => {
        throw new Error("db write failure");
      };

    await expect(
      runContentProduction({ candidateId: "cq_c1" }, { db: fake.db, provider }),
    ).rejects.toThrow("db write failure");

    // 롤백: QA 기록 없음, 상태는 GENERATED 유지
    const gq = fake.store.generatedQuestions[0];
    expect(gq.status).toBe("GENERATED");
    expect(fake.store.qaRecords).toHaveLength(0);

    (fake.db as unknown as { generatedQuestion: { update: unknown } }).generatedQuestion.update =
      originalUpdate;
  });

  it("존재하지 않는 candidateId → throw (잘못된 입력)", async () => {
    const fake = createFakeContentDb();
    const provider = new MockLlmProvider(happyScript());
    await expect(
      runContentProduction({ candidateId: "cq_missing" }, { db: fake.db, provider }),
    ).rejects.toThrow("candidate not found");
  });
});
