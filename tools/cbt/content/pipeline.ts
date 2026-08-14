// STEP 8 — Content Production Pipeline 오케스트레이션 (STEP 8 §20/§21).
// Candidate 1건 → Fact Extraction → Generation → GeneratedQuestion 저장 → Auto-QA → QA 저장.
// 모든 실패는 FAILED/QA_FAILED 상태로 보존된다 (No Drop). Candidate는 읽기만 한다.
import { createHash } from "node:crypto";
import type { CandidateQuestion, Prisma } from "@/generated/prisma/client";
import type { CandidateContent, GeneratedQuestionStatus } from "./types";
import type { LlmProvider } from "./provider/types";
import type { ContentDb } from "./persist/content-repository";
import {
  createGeneratedQuestionRecord,
  createQaRecord,
  findCandidateById,
  getDefaultContentDb,
  updateGeneratedQuestionStatus,
} from "./persist/content-repository";
import { extractFactsFromCandidate } from "./fact-extraction";
import { generateQuestionFromFacts } from "./generate";
import { runAutoQa } from "./qa";
import { createDefaultProvider } from "./provider";

export type RunContentPipelineInput = {
  candidateId: string;
  /** true면 LLM으로 fact extraction 시도 (guardrail 실패 시 deterministic fallback) */
  llmFacts?: boolean;
};

export type RunContentPipelineResult = {
  generatedQuestionId: string;
  status: GeneratedQuestionStatus;
  similarityScore: number | null;
  similarityWarning: boolean;
  qaPassed: boolean;
  qaFailed: boolean;
  errorCode: string | null;
};

export type RunContentPipelineDeps = {
  db?: ContentDb;
  provider?: LlmProvider;
};

/** CandidateQuestion 행 → Content 파이프라인 읽기용 뷰 (원본 불변) */
export function toCandidateContent(row: CandidateQuestion): CandidateContent {
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

/** 생성 콘텐츠의 결정적 fingerprint (중복/변경 추적용) */
export function contentFingerprintOf(content: {
  questionText: string;
  choices: { text: string }[];
  answers: number[];
  explanation: string;
}): string {
  const canonical = JSON.stringify({
    questionText: content.questionText,
    choices: content.choices.map((c) => c.text),
    answers: content.answers,
    explanation: content.explanation,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Candidate 1건에 대한 콘텐츠 생산 실행 (생성 + QA, append-only).
 * 실패 시에도 GeneratedQuestion 행을 남긴다 (No Drop).
 * 같은 candidateId로 재실행하면 새 행이 생성된다 (재생성/재시도 보존).
 */
export async function runContentProduction(
  input: RunContentPipelineInput,
  deps: RunContentPipelineDeps = {},
): Promise<RunContentPipelineResult> {
  const db = deps.db ?? (await getDefaultContentDb());
  const provider = deps.provider ?? createDefaultProvider();

  const candidate = await findCandidateById(db, input.candidateId);
  if (!candidate) {
    throw new Error(`candidate not found: ${input.candidateId}`);
  }
  const candidateContent = toCandidateContent(candidate);

  // ------------------------------------------------------------------
  // STEP 8-1 — Fact Extraction
  // ------------------------------------------------------------------
  const facts = await extractFactsFromCandidate(
    candidateContent,
    input.llmFacts ? provider : undefined,
  );
  if (facts.facts.length === 0) {
    const failed = await createGeneratedQuestionRecord(db, {
      candidateQuestionId: candidate.id,
      status: "FAILED",
      provider: provider.provider,
      model: provider.model,
      promptVersion: null,
      errorCode: "fact_extraction_failed",
      errorMessage: "추출된 사실이 없어 문제를 생성할 수 없습니다.",
    });
    return {
      generatedQuestionId: failed.id,
      status: "FAILED",
      similarityScore: null,
      similarityWarning: false,
      qaPassed: false,
      qaFailed: false,
      errorCode: "fact_extraction_failed",
    };
  }

  // ------------------------------------------------------------------
  // STEP 8-2 — Question Generation
  // ------------------------------------------------------------------
  const generation = await generateQuestionFromFacts(
    candidateContent,
    facts,
    provider,
  );

  if (!generation.ok) {
    const failed = await createGeneratedQuestionRecord(db, {
      candidateQuestionId: candidate.id,
      status: "FAILED",
      provider: generation.failure.provider,
      model: generation.failure.model,
      promptVersion: generation.failure.promptVersion,
      rawLlmResponse: generation.failure.rawResponse,
      errorCode: generation.failure.code,
      errorMessage: generation.failure.message,
    });
    return {
      generatedQuestionId: failed.id,
      status: "FAILED",
      similarityScore: null,
      similarityWarning: false,
      qaPassed: false,
      qaFailed: false,
      errorCode: generation.failure.code,
    };
  }

  // ------------------------------------------------------------------
  // STEP 8-3 — GeneratedQuestion 저장 (status: GENERATED)
  // ------------------------------------------------------------------
  const generated = await createGeneratedQuestionRecord(db, {
    candidateQuestionId: candidate.id,
    status: "GENERATED",
    content: generation.content,
    contentFingerprint: contentFingerprintOf(generation.content),
    similarityScore: generation.similarityScore,
    similarityWarning: generation.similarityWarning,
    provider: generation.provider,
    model: generation.model,
    promptVersion: generation.promptVersion,
    rawLlmResponse: generation.rawLlmResponse,
  });

  // ------------------------------------------------------------------
  // STEP 8-4 — Auto-QA + 상태 반영 (transaction)
  // QA 실패도 QA 행 + QA_FAILED 상태로 보존한다 (No Drop).
  // ------------------------------------------------------------------
  const qa = await runAutoQa(candidateContent, generation.content, provider);

  const qaPassed = qa.ok && qa.evaluation.pass;
  const qaFailed = !qa.ok || !qa.evaluation.pass;
  const nextStatus: GeneratedQuestionStatus = qaPassed
    ? "QA_PASSED"
    : "QA_FAILED";

  await db.$transaction(async (tx) => {
    await createQaRecord(tx, {
      generatedQuestionId: generated.id,
      evaluation: qa.ok
        ? {
            criteria: qa.evaluation
              .criteria as unknown as Prisma.InputJsonValue,
            hasHallucination: qa.evaluation.hasHallucination,
            isCopyrightSafe: qa.evaluation.isCopyrightSafe,
            criticalFlaws: qa.evaluation.criticalFlaws,
            pass: qa.evaluation.pass,
          }
        : null,
      provider: qa.ok ? qa.provider : qa.failure.provider,
      model: qa.ok ? qa.model : qa.failure.model,
      promptVersion: qa.ok ? qa.promptVersion : qa.failure.promptVersion,
      rawLlmResponse: qa.ok ? qa.rawLlmResponse : qa.failure.rawResponse,
      errorCode: qa.ok ? null : qa.failure.code,
      errorMessage: qa.ok ? null : qa.failure.message,
    });
    await updateGeneratedQuestionStatus(tx, generated.id, nextStatus, {
      ...(qa.ok
        ? {}
        : { errorCode: qa.failure.code, errorMessage: qa.failure.message }),
    });
  });

  return {
    generatedQuestionId: generated.id,
    status: nextStatus,
    similarityScore: generation.similarityScore,
    similarityWarning: generation.similarityWarning,
    qaPassed,
    qaFailed,
    errorCode: qa.ok ? null : qa.failure.code,
  };
}
