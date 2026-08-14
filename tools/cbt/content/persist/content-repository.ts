// STEP 8 — Content 파이프라인 영속 계층 (STEP 8 §16/§17/§19).
// GeneratedQuestion / GeneratedQuestionQA / MasterQuestion 저장.
// - No Drop: 실패/오류/원본 rawLlmResponse까지 전부 보존한다.
// - Append-only: 재생성은 새 UUID 행을 만들고 기존 행을 덮어쓰지 않는다.
// - Promotion은 idempotent: 동일 generatedQuestionId의 Master 중복 생성 금지.
// - CandidateQuestion은 읽기 전용으로만 사용한다 (수정 금지).
import { Prisma } from "@/generated/prisma/client";
import type {
  CandidateQuestion,
  GeneratedQuestion,
  GeneratedQuestionQA,
  MasterQuestion,
} from "@/generated/prisma/client";
import type { GeneratedQuestionStatus } from "../types";
import type { GeneratedContent } from "../types";

/** STEP 8에서 사용하는 Prisma delegate/트랜잭션 최소 인터페이스 */
export type ContentDb = {
  candidateQuestion: {
    findUnique(
      args: Prisma.CandidateQuestionFindUniqueArgs,
    ): Promise<CandidateQuestion | null>;
  };
  generatedQuestion: {
    create(
      args: Prisma.GeneratedQuestionCreateArgs,
    ): Promise<GeneratedQuestion>;
    update(
      args: Prisma.GeneratedQuestionUpdateArgs,
    ): Promise<GeneratedQuestion>;
    findUnique(
      args: Prisma.GeneratedQuestionFindUniqueArgs,
    ): Promise<GeneratedQuestion | null>;
  };
  generatedQuestionQA: {
    create(
      args: Prisma.GeneratedQuestionQACreateArgs,
    ): Promise<GeneratedQuestionQA>;
  };
  masterQuestion: {
    create(
      args: Prisma.MasterQuestionCreateArgs,
    ): Promise<MasterQuestion>;
    findUnique(
      args: Prisma.MasterQuestionFindUniqueArgs,
    ): Promise<MasterQuestion | null>;
  };
  $transaction: <R>(fn: (tx: ContentDb) => Promise<R>) => Promise<R>;
};

/** 기본 DB (실제 Prisma). CLI/운영에서 사용 */
export async function getDefaultContentDb(): Promise<ContentDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as ContentDb;
}

/** Candidate 질문 조회 (읽기 전용) */
export async function findCandidateById(
  db: ContentDb,
  candidateId: string,
): Promise<CandidateQuestion | null> {
  return db.candidateQuestion.findUnique({ where: { id: candidateId } });
}

/** JSON 파싱 가능하면 파싱값, 아니면 { __raw: 원문 } 래퍼로 보존한다 (No Drop, 유실 방지) */
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

export type GeneratedQuestionCreateInput = {
  candidateQuestionId: string;
  status: GeneratedQuestionStatus;
  content?: GeneratedContent | null;
  contentFingerprint?: string | null;
  similarityScore?: number | null;
  similarityWarning?: boolean;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  rawLlmResponse?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

/** 생성 시도 1건을 새 행으로 저장한다 (append-only, UUID 새로 발급) */
export async function createGeneratedQuestionRecord(
  db: ContentDb,
  input: GeneratedQuestionCreateInput,
): Promise<GeneratedQuestion> {
  return db.generatedQuestion.create({
    data: {
      candidateQuestionId: input.candidateQuestionId,
      status: input.status,
      questionText: input.content?.questionText ?? null,
      choices: input.content
        ? (input.content.choices as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      answers: input.content
        ? (input.content.answers as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      explanation: input.content?.explanation ?? null,
      category: input.content?.category ?? null,
      difficulty: input.content?.difficulty ?? null,
      factSourceMapping: input.content
        ? (input.content.factSourceMapping as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      contentFingerprint: input.contentFingerprint ?? null,
      similarityScore: input.similarityScore ?? null,
      similarityWarning: input.similarityWarning ?? false,
      provider: input.provider ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      rawLlmResponse: input.rawLlmResponse
        ? toJsonValue(input.rawLlmResponse)
        : Prisma.JsonNull,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

export type GeneratedQuestionQaCreateInput = {
  generatedQuestionId: string;
  evaluation?: {
    criteria: Prisma.InputJsonValue;
    hasHallucination: boolean;
    isCopyrightSafe: boolean;
    criticalFlaws: string[];
    pass: boolean;
  } | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  rawLlmResponse?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

/** QA 실행 결과 1건을 별도 행으로 저장한다 (재검수/이력 보존, 1:N) */
export async function createQaRecord(
  db: ContentDb,
  input: GeneratedQuestionQaCreateInput,
): Promise<GeneratedQuestionQA> {
  return db.generatedQuestionQA.create({
    data: {
      generatedQuestionId: input.generatedQuestionId,
      evaluationScores: input.evaluation
        ? input.evaluation.criteria
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
      provider: input.provider ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      rawLlmResponse: input.rawLlmResponse
        ? toJsonValue(input.rawLlmResponse)
        : Prisma.JsonNull,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

/** 상태 전이 (QA 결과 반영 등). 재검수 이력은 별도 행으로 남는다 */
export async function updateGeneratedQuestionStatus(
  db: ContentDb,
  id: string,
  status: GeneratedQuestionStatus,
  extra: { errorCode?: string | null; errorMessage?: string | null } = {},
): Promise<GeneratedQuestion> {
  return db.generatedQuestion.update({
    where: { id },
    data: {
      status,
      ...(extra.errorCode !== undefined
        ? { errorCode: extra.errorCode }
        : {}),
      ...(extra.errorMessage !== undefined
        ? { errorMessage: extra.errorMessage }
        : {}),
    },
  });
}

/** Human Review 결과 반영 */
export async function updateReviewFields(
  db: ContentDb,
  id: string,
  status: GeneratedQuestionStatus,
  reviewedBy?: string,
): Promise<GeneratedQuestion> {
  return db.generatedQuestion.update({
    where: { id },
    data: {
      status,
      reviewedBy: reviewedBy ?? null,
      reviewedAt: new Date(),
    },
  });
}

export async function findGeneratedQuestionById(
  db: ContentDb,
  id: string,
): Promise<GeneratedQuestion | null> {
  return db.generatedQuestion.findUnique({ where: { id } });
}

export async function findMasterByGeneratedQuestionId(
  db: ContentDb,
  generatedQuestionId: string,
): Promise<MasterQuestion | null> {
  return db.masterQuestion.findUnique({
    where: { generatedQuestionId },
  });
}
