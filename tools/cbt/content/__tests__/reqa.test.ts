/* eslint-disable @typescript-eslint/no-explicit-any */
// STEP 8 re-QA — QA v3 append-only 재실행 runner 테스트.
// 안전성 핵심 검증:
// - GeneratedQuestion.status 미변경
// - 기존 QA 행 수정/삭제 없음, 신규 QA INSERT만
// - semantic v3 존재 시 skip, transient retry 최대 1회
import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "../provider/mock";
import { qaPassPayload } from "./helpers";
import type { QaLlmOutput } from "../schemas";
import {
  runReQaItem,
  runReQaBatch,
  toGeneratedContent,
} from "../reqa";
import type { ReQaDb } from "../reqa";

type Row = any;

const QA_V3 = "step8-auto-qa-v3.1";

function makeCandidate(over: Row = {}): Row {
  return {
    id: "cq-1",
    sourceName: "test-source",
    sourceQuestionId: "q-1",
    category: "CAT-HANDLING",
    classificationMethod: "source",
    questionText: "화물 적재 시 무게 중심을 낮추는 이유는?",
    choices: [
      { index: 1, text: "연비 향상" },
      { index: 2, text: "전복 사고 예방" },
      { index: 3, text: "적재량 증가" },
      { index: 4, text: "하역 속도 향상" },
    ],
    normalizedAnswers: [2],
    explanation: "무게 중심이 낮으면 전복 위험이 줄어든다.",
    images: [],
    validationStatus: "VALID",
    validationErrors: [],
    contentFingerprint: "fp",
    createdAt: new Date("2026-08-14T00:00:00Z"),
    updatedAt: new Date("2026-08-14T00:00:00Z"),
    ...over,
  };
}

function makeGenerated(over: Row = {}): Row {
  return {
    id: "gq-1",
    candidateQuestionId: "cq-1",
    status: "QA_PASSED",
    questionText: "화물 적재 시 무게 중심을 낮추는 이유는?",
    choices: [
      { index: 1, text: "연비 향상" },
      { index: 2, text: "전복 사고 예방" },
      { index: 3, text: "적재량 증가" },
      { index: 4, text: "하역 속도 향상" },
    ],
    answers: [2],
    explanation: "무게 중심이 낮으면 전복 위험이 줄어든다.",
    category: "CAT-HANDLING",
    difficulty: "MEDIUM",
    factSourceMapping: [{ statement: "무게 중심을 낮춘다", usedAs: "answer_basis" }],
    provider: "openai-compatible",
    model: "deepseek-v4-flash-free",
    promptVersion: "step8-question-gen-v1",
    rawLlmResponse: null,
    createdAt: new Date("2026-08-14T00:00:00Z"),
    updatedAt: new Date("2026-08-14T00:00:00Z"),
    ...over,
  };
}

function makeTransientV3Row(genId: string, createdAt: Date, errorCode = "timeout"): Row {
  return {
    id: `qa_t_${Math.random().toString(36).slice(2)}`,
    generatedQuestionId: genId,
    promptVersion: QA_V3,
    evaluationScores: null,
    hasHallucination: null,
    isCopyrightSafe: null,
    criticalFlaws: null,
    qaFeedback: null,
    isPass: null,
    provider: "mock",
    model: "mock-model",
    rawLlmResponse: null,
    errorCode,
    errorMessage: errorCode,
    createdAt,
  };
}

function makeFakeDb(seed: { candidates?: Row[]; generated?: Row[]; qas?: Row[] } = {}) {
  const candidates: Row[] = [...(seed.candidates ?? [])];
  const generated: Row[] = [...(seed.generated ?? [])];
  const qas: Row[] = [...(seed.qas ?? [])];
  let qaSeq = 0;

  const db: ReQaDb = {
    candidateQuestion: {
      async findUnique(args: any) {
        return candidates.find((c) => c.id === args?.where?.id) ?? null;
      },
      async findMany() {
        return candidates;
      },
    },
    generatedQuestion: {
      async findUnique(args: any) {
        return generated.find((g) => g.id === args?.where?.id) ?? null;
      },
      async findMany(args: any) {
        const select = args?.select ?? null;
        return generated.map((g) =>
          select ? { id: g.id, status: g.status, updatedAt: g.updatedAt } : g,
        );
      },
    },
    generatedQuestionQA: {
      async findMany(args: any) {
        let rows = qas;
        if (args?.where?.generatedQuestionId) {
          rows = rows.filter((q) => q.generatedQuestionId === args.where.generatedQuestionId);
        }
        if (args?.where?.promptVersion) {
          rows = rows.filter((q) => q.promptVersion === args.where.promptVersion);
        }
        return rows;
      },
      async count() {
        return qas.length;
      },
      async create(args: any) {
        const row: Row = { id: `qa_${++qaSeq}`, createdAt: new Date(), ...args.data };
        qas.push(row);
        return row;
      },
    },
    masterQuestion: {
      async findMany() {
        return [];
      },
    },
  };

  return { db, store: { candidates, generated, qas } };
}

describe("reqa: toGeneratedContent", () => {
  it("유효한 생성 행은 GeneratedContent로 복원된다", () => {
    const content = toGeneratedContent(makeGenerated());
    expect(content).not.toBeNull();
    expect(content?.choices.length).toBe(4);
    expect(content?.answers).toEqual([2]);
  });

  it("questionText가 비어 있으면 null", () => {
    expect(toGeneratedContent(makeGenerated({ questionText: "" }))).toBeNull();
  });

  it("choices/answers가 없으면 null", () => {
    expect(toGeneratedContent(makeGenerated({ choices: null, answers: null }))).toBeNull();
  });
});

describe("reqa: 정상 QA", () => {
  it("load → runAutoQa → QA v3 INSERT, GeneratedQuestion.status 미변경", async () => {
    const cand = makeCandidate();
    const gen = makeGenerated({ status: "QA_FAILED" });
    const { db, store } = makeFakeDb({ candidates: [cand], generated: [gen] });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, gen.id);

    expect(res.executed).toBe(true);
    expect(res.qaPassed).toBe(true);
    expect(res.guardReason).toBe("ok");
    expect(res.attemptNumber).toBe(1);
    expect(res.sourceQuestionId).toBe("q-1");
    expect(store.qas.length).toBe(1);
    expect(store.qas[0].generatedQuestionId).toBe(gen.id);
    expect(store.qas[0].promptVersion).toBe(QA_V3);
    expect(store.qas[0].isPass).toBe(true);
    // 안전: status/updatedAt 미변경
    expect(store.generated[0].status).toBe("QA_FAILED");
    expect(store.generated[0].updatedAt).toBe(gen.updatedAt);
  });

  it("criticalFlaws가 있으면 qaPassed=false + criticalFlaws 기록", async () => {
    const payload: QaLlmOutput = {
      ...qaPassPayload(),
      pass: false,
      criticalFlaws: ["원문 정답 미보존"],
    };
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: payload });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(true);
    expect(res.qaPassed).toBe(false);
    expect(res.criticalFlaws).toEqual(["원문 정답 미보존"]);
    expect(store.qas[0].isPass).toBe(false);
    expect(store.qas[0].criticalFlaws).toEqual(["원문 정답 미보존"]);
  });
});

describe("reqa: idempotency (semantic v3)", () => {
  it("정상 semantic v3 결과 존재 → skip, 신규 INSERT 없음, LLM 0 call", async () => {
    const existing: Row = {
      id: "qa_existing",
      generatedQuestionId: "gq-1",
      promptVersion: QA_V3,
      isPass: false,
      errorCode: null,
      createdAt: new Date(),
    };
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated()],
      qas: [existing],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("semantic_v3_exists");
    expect(store.qas.length).toBe(1);
    expect(provider.calls).toBe(0);
  });
});

describe("reqa: transient retry 정책", () => {
  it("transient v3 0개 → 최초 실행 (attemptNumber=1)", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(true);
    expect(res.attemptNumber).toBe(1);
    expect(store.qas.length).toBe(1);
  });

  it("transient v3 1개 → retry 1회 허용 (attemptNumber=2), 기존 행 수정 없음", async () => {
    const gen = makeGenerated();
    const existing = makeTransientV3Row(gen.id, new Date("2026-08-14T00:00:00Z"));
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [gen],
      qas: [existing],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, gen.id);

    expect(res.executed).toBe(true);
    expect(res.attemptNumber).toBe(2);
    expect(store.qas.length).toBe(2);
    expect(store.qas[0]).toBe(existing);
    expect(store.qas[0].errorCode).toBe("timeout");
  });

  it("transient v3 2개 → skip (transient_exhausted)", async () => {
    const gen = makeGenerated();
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [gen],
      qas: [
        makeTransientV3Row(gen.id, new Date("2026-08-14T00:00:00Z")),
        makeTransientV3Row(gen.id, new Date("2026-08-14T00:01:00Z"), "provider_error"),
      ],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, gen.id);

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("transient_exhausted");
    expect(store.qas.length).toBe(2);
    expect(provider.calls).toBe(0);
  });

  it("transient 결과도 append-only로 INSERT된다", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "timeout", delayMs: 1 });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(true);
    expect(res.errorCode).toBe("timeout");
    expect(store.qas.length).toBe(1);
    expect(store.qas[0].isPass).toBeNull();
    expect(store.qas[0].errorCode).toBe("timeout");
  });
});

describe("reqa: pre-flight guards", () => {
  it("mock provider 생성 행 → skip", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated({ provider: "mock" })],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("mock_provider");
    expect(store.qas.length).toBe(0);
  });

  it("normalizedAnswers 빈 배열 → skip", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate({ normalizedAnswers: [] })],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("empty_normalized_answers");
    expect(store.qas.length).toBe(0);
  });

  it("normalizedAnswers가 보기에 매핑 불가 → skip (answer_mapping_failed)", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate({ normalizedAnswers: [5] })],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("answer_mapping_failed");
    expect(store.qas.length).toBe(0);
  });

  it("generated content 복원 불가 → skip", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated({ questionText: "" })],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1");

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("content_not_restorable");
    expect(store.qas.length).toBe(0);
  });

  it("generated not found → skip", async () => {
    const { db, store } = makeFakeDb();
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-unknown");

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("generated_not_found");
    expect(store.qas.length).toBe(0);
  });
});

describe("reqa: dry-run", () => {
  it("dry-run: LLM 0 call, DB write 0, guard 해석만 출력", async () => {
    const { db, store } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const res = await runReQaItem(db, provider, "gq-1", { dryRun: true });

    expect(res.executed).toBe(false);
    expect(res.guardReason).toBe("ok");
    expect(res.attemptNumber).toBe(1);
    expect(store.qas.length).toBe(0);
    expect(provider.calls).toBe(0);
  });
});

describe("reqa: 배치 실행", () => {
  it("한 건 LLM 실패가 다른 건을 중단시키지 않는다", async () => {
    const c1 = makeCandidate({ id: "cq-1" });
    const c2 = makeCandidate({ id: "cq-2" });
    const g1 = makeGenerated({ id: "gq-1", candidateQuestionId: "cq-1" });
    const g2 = makeGenerated({ id: "gq-2", candidateQuestionId: "cq-2" });
    const provider = new MockLlmProvider([
      { kind: "timeout", delayMs: 1 },
      { kind: "normal", data: qaPassPayload() },
    ]);
    const { db, store } = makeFakeDb({ candidates: [c1, c2], generated: [g1, g2] });

    const batch = await runReQaBatch(
      { generatedQuestionIds: [g1.id, g2.id] },
      { db, provider },
    );

    expect(batch.total).toBe(2);
    const r1 = batch.results.find((r) => r.generatedQuestionId === g1.id);
    const r2 = batch.results.find((r) => r.generatedQuestionId === g2.id);
    expect(r1?.executed).toBe(true);
    expect(r1?.errorCode).toBe("timeout");
    expect(r2?.executed).toBe(true);
    expect(r2?.qaPassed).toBe(true);
    expect(store.qas.length).toBe(2);
  });

  it("배치 dry-run: executed 0, skip 전부 guard 해석", async () => {
    const { db } = makeFakeDb({
      candidates: [makeCandidate()],
      generated: [makeGenerated()],
    });
    const provider = new MockLlmProvider({ kind: "normal", data: qaPassPayload() });

    const batch = await runReQaBatch(
      { generatedQuestionIds: ["gq-1"], dryRun: true },
      { db, provider },
    );

    expect(batch.executed).toBe(0);
    expect(batch.skipped).toBe(1);
    expect(provider.calls).toBe(0);
  });
});
