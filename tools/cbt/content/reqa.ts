// STEP 8 re-QA — 기존 GeneratedQuestion 대상 QA v3 append-only 재실행.
//
// 안전 원칙 (QA v3 실측 38건):
// - GeneratedQuestion.status 절대 UPDATE 금지 (updateGeneratedQuestionStatus 미사용).
// - DB write는 generated_question_qas에 QA v3 결과 INSERT만 허용.
// - 기존 QA v1/v2/v3 행은 절대 수정·삭제하지 않는다.
// - idempotency: semantic v3 결과(PASS/FAIL) 존재 시 skip.
//   transient v3 결과만 있으면 최대 1회 추가 retry (attempt 2회 초과 시 skip).
// - concurrency=1 고정 (판정력 검증 목적. 처리 속도 최적화 아님).
//
// 기존 runContentProduction/runBatchGenerate는 GeneratedQuestion.status를
// 변경하므로 이 모듈에서 사용하지 않는다.
import { Prisma } from "@/generated/prisma/client";
import type {
  CandidateQuestion,
  GeneratedQuestion,
  GeneratedQuestionQA,
  MasterQuestion,
} from "@/generated/prisma/client";
import type {
  CandidateContent,
  Difficulty,
  FactSourceMappingEntry,
  GeneratedContent,
  GeneratedQuestionStatus,
  QaEvaluation,
} from "./types";
import type { CbtCategoryCode } from "../types";
export { AUTO_QA_PROMPT_VERSION } from "./schemas";
import { AUTO_QA_PROMPT_VERSION } from "./schemas";
import { runAutoQa } from "./qa";
import { createDefaultProvider } from "./provider";
import type { LlmProvider } from "./provider/types";

// ---------------------------------------------------------------------------
// 최소 DB 인터페이스 (기존 ContentDb 수정 없이 자체 정의 — 프로젝트 batch 관례)
// ---------------------------------------------------------------------------

export type ReQaDb = {
  candidateQuestion: {
    findUnique(
      args: Prisma.CandidateQuestionFindUniqueArgs,
    ): Promise<CandidateQuestion | null>;
    findMany(
      args?: Prisma.CandidateQuestionFindManyArgs,
    ): Promise<CandidateQuestion[]>;
  };
  generatedQuestion: {
    findUnique(
      args: Prisma.GeneratedQuestionFindUniqueArgs,
    ): Promise<GeneratedQuestion | null>;
    findMany(
      args?: Prisma.GeneratedQuestionFindManyArgs,
    ): Promise<GeneratedQuestion[]>;
  };
  generatedQuestionQA: {
    findMany(
      args: Prisma.GeneratedQuestionQAFindManyArgs,
    ): Promise<GeneratedQuestionQA[]>;
    count(args?: Prisma.GeneratedQuestionQACountArgs): Promise<number>;
    create(
      args: Prisma.GeneratedQuestionQACreateArgs,
    ): Promise<GeneratedQuestionQA>;
  };
  masterQuestion: {
    findMany(
      args?: Prisma.MasterQuestionFindManyArgs,
    ): Promise<MasterQuestion[]>;
  };
};

/** 기본 DB (실제 Prisma). CLI/운영에서 사용 */
export async function getDefaultReQaDb(): Promise<ReQaDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as ReQaDb;
}

// ---------------------------------------------------------------------------
// transient 오류 코드 (semantic 지표에서 분리)
// ---------------------------------------------------------------------------

export const REQA_TRANSIENT_CODES = new Set<string>([
  "timeout",
  "provider_error",
  "empty_response",
  "malformed_json",
  "schema_validation_failed",
]);

export function isTransientErrorCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && REQA_TRANSIENT_CODES.has(code);
}

// ---------------------------------------------------------------------------
// guard
// ---------------------------------------------------------------------------

export type ReQaSkipReason =
  | "generated_not_found"
  | "candidate_not_found"
  | "mock_provider"
  | "empty_normalized_answers"
  | "answer_mapping_failed"
  | "content_not_restorable"
  | "semantic_v3_exists"
  | "transient_exhausted";

export type ReQaGuardOk = {
  status: "ok";
  attemptNumber: number;
  generated: GeneratedQuestion;
  candidate: CandidateQuestion;
  content: GeneratedContent;
  candidateContent: CandidateContent;
};

export type ReQaGuardSkip = {
  status: "skip";
  reason: ReQaSkipReason;
  message?: string;
  generated: GeneratedQuestion | null;
  candidate: CandidateQuestion | null;
};

export type ReQaGuardResult = ReQaGuardOk | ReQaGuardSkip;

/** CandidateQuestion 행 → 파이프라인 읽기용 뷰 (원본 불변) */
export function toCandidateContent(
  row: CandidateQuestion,
): CandidateContent {
  const choices = Array.isArray(row.choices)
    ? (row.choices as unknown as { index: number; text: string }[])
    : [];
  const answers = Array.isArray(row.normalizedAnswers)
    ? (row.normalizedAnswers as unknown as number[])
    : [];
  return {
    id: row.id,
    category: row.category,
    questionText: row.questionText,
    choices,
    normalizedAnswers: answers,
    explanation: row.explanation,
  };
}

/** 저장된 GeneratedQuestion 행 → GeneratedContent 복원. 복원 불가면 null */
export function toGeneratedContent(
  row: GeneratedQuestion,
): GeneratedContent | null {
  const choices = Array.isArray(row.choices)
    ? (row.choices as unknown as { index: number; text: string }[])
    : null;
  const answers = Array.isArray(row.answers)
    ? (row.answers as unknown as number[])
    : null;
  const factSourceMapping = Array.isArray(row.factSourceMapping)
    ? (row.factSourceMapping as unknown as FactSourceMappingEntry[])
    : [];
  if (
    typeof row.questionText !== "string" ||
    row.questionText.trim() === "" ||
    choices === null ||
    choices.length === 0 ||
    answers === null ||
    answers.length === 0 ||
    typeof row.explanation !== "string" ||
    row.explanation.trim() === "" ||
    typeof row.category !== "string" ||
    row.category === "" ||
    typeof row.difficulty !== "string" ||
    row.difficulty === ""
  ) {
    return null;
  }
  return {
    questionText: row.questionText,
    choices,
    answers,
    explanation: row.explanation,
    category: row.category as CbtCategoryCode,
    difficulty: row.difficulty as Difficulty,
    factSourceMapping,
  };
}

/**
 * 대상 1건의 실행 가능 여부를 판정한다.
 * - semantic v3 결과 존재 → skip (재평가 금지)
 * - transient v3 결과 2개 이상 → skip
 * - transient v3 결과 1개 → retry 1회 허용 (attemptNumber=2)
 * - v3 결과 없음 → 최초 실행 (attemptNumber=1)
 */
async function evaluateGuard(
  db: ReQaDb,
  id: string,
): Promise<ReQaGuardResult> {
  const generated = await db.generatedQuestion.findUnique({ where: { id } });
  if (!generated) {
    return {
      status: "skip",
      reason: "generated_not_found",
      generated: null,
      candidate: null,
    };
  }

  const candidate = await db.candidateQuestion.findUnique({
    where: { id: generated.candidateQuestionId },
  });
  if (!candidate) {
    return {
      status: "skip",
      reason: "candidate_not_found",
      generated,
      candidate: null,
    };
  }

  // provider contamination: mock 생성/QA 데이터는 실측 대상 제외
  if (generated.provider === "mock") {
    return { status: "skip", reason: "mock_provider", generated, candidate };
  }

  const candidateContent = toCandidateContent(candidate);

  // 원문 정답 보존 guard: 빈 정답 → LLM/DB write 금지
  if (candidateContent.normalizedAnswers.length === 0) {
    return {
      status: "skip",
      reason: "empty_normalized_answers",
      generated,
      candidate,
    };
  }

  // runtime prompt의 '원문의 정답 보기' 매핑이 가능한지 사전 확인
  const answerMapped = candidateContent.normalizedAnswers.every((answerIndex) =>
    candidateContent.choices.some((c) => c.index === answerIndex),
  );
  if (!answerMapped) {
    return {
      status: "skip",
      reason: "answer_mapping_failed",
      generated,
      candidate,
    };
  }

  const content = toGeneratedContent(generated);
  if (!content) {
    return {
      status: "skip",
      reason: "content_not_restorable",
      generated,
      candidate,
    };
  }

  const v3Rows = await db.generatedQuestionQA.findMany({
    where: {
      generatedQuestionId: id,
      promptVersion: AUTO_QA_PROMPT_VERSION,
    },
    orderBy: { createdAt: "asc" },
  });

  const semanticRows = v3Rows.filter((r) => r.isPass !== null);
  if (semanticRows.length > 0) {
    return { status: "skip", reason: "semantic_v3_exists", generated, candidate };
  }

  // semantic 결과가 없는 v3 행은 모두 transient 시도로 취급한다
  if (v3Rows.length >= 2) {
    return { status: "skip", reason: "transient_exhausted", generated, candidate };
  }

  return {
    status: "ok",
    attemptNumber: v3Rows.length + 1,
    generated,
    candidate,
    content,
    candidateContent,
  };
}

// ---------------------------------------------------------------------------
// QA v3 결과 append-only INSERT
// ---------------------------------------------------------------------------

function toJsonValue(
  raw: string | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return Prisma.JsonNull;
  }
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    return { __raw: raw } as Prisma.InputJsonValue;
  }
}

export type ReQaQaInsertInput = {
  generatedQuestionId: string;
  evaluation: QaEvaluation | null;
  provider: string;
  model: string;
  promptVersion: string;
  rawLlmResponse: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/** createQaRecord와 동일한 매핑 (ContentDb 불필요 — 자체 최소 인터페이스용) */
export async function insertQaRecord(
  db: Pick<ReQaDb, "generatedQuestionQA">,
  input: ReQaQaInsertInput,
): Promise<GeneratedQuestionQA> {
  return db.generatedQuestionQA.create({
    data: {
      generatedQuestionId: input.generatedQuestionId,
      evaluationScores: input.evaluation
        ? (input.evaluation.criteria as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      hasHallucination: input.evaluation?.hasHallucination ?? null,
      isCopyrightSafe: input.evaluation?.isCopyrightSafe ?? null,
      criticalFlaws: input.evaluation
        ? (input.evaluation.criticalFlaws as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      qaFeedback: input.evaluation?.pass
        ? null
        : (input.evaluation?.criticalFlaws ?? []).join("; ") || null,
      isPass: input.evaluation?.pass ?? null,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      rawLlmResponse: toJsonValue(input.rawLlmResponse),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    },
  });
}

// ---------------------------------------------------------------------------
// 대상 1건 실행
// ---------------------------------------------------------------------------

export type ReQaItemResult = {
  generatedQuestionId: string;
  sourceQuestionId: string | null;
  category: string | null;
  currentStatus: string | null;
  guardReason: string;
  attemptNumber: number | null;
  executed: boolean;
  qaPassed: boolean | null;
  hasHallucination: boolean | null;
  criticalFlaws: string[] | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
};

export async function runReQaItem(
  db: ReQaDb,
  provider: LlmProvider,
  id: string,
  opts: { dryRun?: boolean } = {},
): Promise<ReQaItemResult> {
  const started = Date.now();

  const base: ReQaItemResult = {
    generatedQuestionId: id,
    sourceQuestionId: null,
    category: null,
    currentStatus: null,
    guardReason: "ok",
    attemptNumber: null,
    executed: false,
    qaPassed: null,
    hasHallucination: null,
    criticalFlaws: null,
    errorCode: null,
    errorMessage: null,
    durationMs: 0,
  };

  const guard = await evaluateGuard(db, id);

  if (guard.generated) {
    base.sourceQuestionId = guard.candidate?.sourceQuestionId ?? null;
    base.category = guard.generated.category ?? null;
    base.currentStatus = guard.generated.status as GeneratedQuestionStatus;
  }

  if (guard.status === "skip") {
    return {
      ...base,
      guardReason: guard.reason,
      errorMessage: guard.message ?? null,
      durationMs: Date.now() - started,
    };
  }

  base.attemptNumber = guard.attemptNumber;

  if (opts.dryRun === true) {
    return { ...base, durationMs: Date.now() - started };
  }

  const qa = await runAutoQa(
    guard.candidateContent,
    guard.content,
    provider,
  );

  if (qa.ok) {
    await insertQaRecord(db, {
      generatedQuestionId: id,
      evaluation: qa.evaluation,
      provider: qa.provider,
      model: qa.model,
      promptVersion: qa.promptVersion,
      rawLlmResponse: qa.rawLlmResponse,
      errorCode: null,
      errorMessage: null,
    });
    return {
      ...base,
      executed: true,
      qaPassed: qa.evaluation.pass,
      hasHallucination: qa.evaluation.hasHallucination,
      criticalFlaws: qa.evaluation.criticalFlaws,
      durationMs: Date.now() - started,
    };
  }

  await insertQaRecord(db, {
    generatedQuestionId: id,
    evaluation: null,
    provider: qa.failure.provider,
    model: qa.failure.model,
    promptVersion: qa.failure.promptVersion,
    rawLlmResponse: qa.failure.rawResponse,
    errorCode: qa.failure.code,
    errorMessage: qa.failure.message,
  });
  return {
    ...base,
    executed: true,
    errorCode: qa.failure.code,
    errorMessage: qa.failure.message,
    durationMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// 배치 실행 (concurrency=1 고정, 개별 실패 격리)
// ---------------------------------------------------------------------------

export type ReQaBatchResult = {
  total: number;
  executed: number;
  skipped: number;
  results: ReQaItemResult[];
  durationMs: number;
};

export async function runReQaBatch(
  opts: { generatedQuestionIds: string[]; dryRun?: boolean },
  deps: { db?: ReQaDb; provider?: LlmProvider } = {},
): Promise<ReQaBatchResult> {
  const db = deps.db ?? (await getDefaultReQaDb());
  const provider = deps.provider ?? createDefaultProvider();
  const started = Date.now();
  const results: ReQaItemResult[] = [];

  for (const id of opts.generatedQuestionIds) {
    try {
      results.push(await runReQaItem(db, provider, id, { dryRun: opts.dryRun }));
    } catch (error) {
      results.push({
        generatedQuestionId: id,
        sourceQuestionId: null,
        category: null,
        currentStatus: null,
        guardReason: "error",
        attemptNumber: null,
        executed: false,
        qaPassed: null,
        hasHallucination: null,
        criticalFlaws: null,
        errorCode: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      });
    }
  }

  return {
    total: results.length,
    executed: results.filter((r) => r.executed).length,
    skipped: results.filter((r) => !r.executed).length,
    results,
    durationMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// DB 안전성 snapshot (read-only). 실측 전/후 비교용.
// ---------------------------------------------------------------------------

export type DbSnapshot = {
  takenAt: string;
  generatedQuestions: { id: string; status: string | null; updatedAt: string | null }[];
  masterQuestions: { id: string; updatedAt: string | null }[];
  candidateQuestions: { id: string; updatedAt: string | null }[];
  qaCount: number;
};

export async function captureDbSnapshot(db: ReQaDb): Promise<DbSnapshot> {
  const [generatedQuestions, masterQuestions, candidateQuestions, qaCount] =
    await Promise.all([
      db.generatedQuestion.findMany({
        select: { id: true, status: true, updatedAt: true },
      }),
      db.masterQuestion.findMany({
        select: { id: true, updatedAt: true },
      }),
      db.candidateQuestion.findMany({
        select: { id: true, updatedAt: true },
      }),
      db.generatedQuestionQA.count(),
    ]);
  return {
    takenAt: new Date().toISOString(),
    generatedQuestions: generatedQuestions.map((r) => ({
      id: r.id,
      status: r.status as string | null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
    masterQuestions: masterQuestions.map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
    candidateQuestions: candidateQuestions.map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
    qaCount,
  };
}

export type DbSnapshotDiff = {
  generatedQuestionModified: number;
  masterQuestionModified: number;
  candidateQuestionModified: number;
  qaCountDelta: number;
  modifiedGeneratedQuestions: { id: string; before: string | null; after: string | null }[];
  modifiedMasters: { id: string; before: string | null; after: string | null }[];
  modifiedCandidates: { id: string; before: string | null; after: string | null }[];
};

function diffColumn(
  before: DbSnapshot,
  after: DbSnapshot,
  key: "generatedQuestions" | "masterQuestions" | "candidateQuestions",
): { count: number; rows: { id: string; before: string | null; after: string | null }[] } {
  const snapshotValue = (r: {
    id: string;
    updatedAt: string | null;
    status?: string | null;
  }): string => `${r.status ?? "?"}|${r.updatedAt ?? "null"}`;
  const beforeMap = new Map(before[key].map((r) => [r.id, snapshotValue(r)]));
  const afterMap = new Map(after[key].map((r) => [r.id, snapshotValue(r)]));
  const rows: { id: string; before: string | null; after: string | null }[] = [];
  for (const [id, afterVal] of afterMap) {
    const beforeVal = beforeMap.get(id);
    if (beforeVal === undefined) continue; // 실측 중 새로 추가된 행(없어야 함)은 별도로 취급
    if (beforeVal !== afterVal) {
      rows.push({ id, before: beforeVal, after: afterVal });
    }
  }
  return { count: rows.length, rows };
}

export function diffDbSnapshots(
  before: DbSnapshot,
  after: DbSnapshot,
): DbSnapshotDiff {
  const gen = diffColumn(before, after, "generatedQuestions");
  const master = diffColumn(before, after, "masterQuestions");
  const candidate = diffColumn(before, after, "candidateQuestions");
  return {
    generatedQuestionModified: gen.count,
    masterQuestionModified: master.count,
    candidateQuestionModified: candidate.count,
    qaCountDelta: after.qaCount - before.qaCount,
    modifiedGeneratedQuestions: gen.rows,
    modifiedMasters: master.rows,
    modifiedCandidates: candidate.rows,
  };
}
