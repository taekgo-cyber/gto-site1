// STEP 10-2 — NEWBT 정답 백필 orchestration.
// 기존 STEP 1~10 코어(extractor/ingest/normalizer)는 수정하지 않고,
// candidate에 정답만 백필하는 전용 경로. examples API 응답(is_answer)이
// 원천 표기이므로 "추측 금지" 원칙을 지킨다 (API가 제공한 정답을 그대로 사용).
//
// - 대상 선택: sourceName이 일치하고, validationStatus가 REVIEW_REQUIRED이며,
//   normalizedAnswers가 비어 있는 candidate (정답 미확보 상태만).
// - 백필: normalizedAnswers 갱신 + validationErrors에서 answer_missing /
//   answer_unparseable 제거 + (그 외 오류가 없으면) validationStatus = VALID.
// - REVIEW_REQUIRED를 벗어난 후보(VALID/REJECTED)는 변경하지 않는다.
// - dry-run: API 호출 없이 대상 목록만 출력.
import { findNewbtSource, fetchAnswersForNewbtId, createAnswerLimiter } from "../collector/answer-fetch";
import type { Prisma } from "@/generated/prisma/client";
import { CandidateValidationStatus } from "@/generated/prisma/enums";
import { createBatchLogger, type BatchLogger } from "./logger";
import { resolveBatchScope } from "./guard";
import type { CandidateDb } from "../persist/candidate-repository";

export type AnswerBackfillOptions = {
  sourceName: string;
  /** 특정 ID만 처리 (미지정 시 DB 대상 전체) */
  ids?: string[];
  limit?: number | null;
  all?: boolean;
  dryRun?: boolean;
};

export type AnswerBackfillItemResult = {
  candidateId: string;
  sourceQuestionId: string;
  outcome: "backfilled" | "skipped" | "failed";
  answers?: number[];
  error?: string;
  durationMs: number;
};

export type AnswerBackfillSummary = {
  total: number;
  backfilled: number;
  skipped: number;
  failed: number;
  results: AnswerBackfillItemResult[];
  durationMs: number;
};

export type AnswerBackfillDeps = {
  db?: CandidateDb;
  logger?: BatchLogger;
};

type CandidateAnswerRow = {
  id: string;
  sourceName: string;
  sourceQuestionId: string;
  normalizedAnswers: unknown;
  validationStatus: string;
  validationErrors: unknown;
};

/** 백필 대상 후보 조회 (최소 인터페이스) */
export type AnswerCandidateDb = {
  candidateQuestion: {
    findMany(
      args: Prisma.CandidateQuestionFindManyArgs,
    ): Promise<CandidateAnswerRow[]>;
    update(
      args: Prisma.CandidateQuestionUpdateArgs,
    ): Promise<CandidateAnswerRow>;
  };
  candidateReview?: {
    findUnique(
      args: Prisma.CandidateReviewFindUniqueArgs,
    ): Promise<{ reviewStatus: string } | null>;
    update(
      args: Prisma.CandidateReviewUpdateArgs,
    ): Promise<{ reviewStatus: string }>;
  };
};

/** 정답 부재 관련 validationErrors (백필 시 제거) */
const ANSWER_ERROR_CODES = new Set(["answer_missing", "answer_unparseable"]);

/**
 * validationErrors 배열에서 정답 부재 오류를 제거한다.
 * JSON 타입은 문자열 배열 또는 {__raw...} 래퍼일 수 있어 안전하게 취급한다.
 */
function stripAnswerErrors(raw: unknown): string[] {
  let errors: string[] = [];
  if (Array.isArray(raw)) {
    errors = raw.filter((e): e is string => typeof e === "string");
  }
  return errors.filter((code) => !ANSWER_ERROR_CODES.has(code));
}

export async function runAnswerBackfill(
  opts: AnswerBackfillOptions,
  deps: AnswerBackfillDeps = {},
): Promise<AnswerBackfillSummary> {
  const logger = deps.logger ?? createBatchLogger("answer-fetch");
  const source = findNewbtSource();
  const { sourceName, ids, all, dryRun } = opts;

  const mod = await import("@/lib/prisma");
  const db = (deps.db ?? mod.prisma) as unknown as AnswerCandidateDb;

  const limiter = createAnswerLimiter();
  const startedAt = Date.now();

  let rows: CandidateAnswerRow[];
  if (ids && ids.length > 0) {
    const found = await db.candidateQuestion.findMany({
      where: {
        sourceName,
        sourceQuestionId: { in: ids },
      },
      orderBy: { createdAt: "asc" },
    });
    // ids 순서 유지
    const byId = new Map(found.map((r) => [r.sourceQuestionId, r]));
    rows = ids
      .map((id) => byId.get(id))
      .filter((r): r is CandidateAnswerRow => r !== undefined);
  } else {
    rows = await db.candidateQuestion.findMany({
      where: { sourceName },
      orderBy: { createdAt: "asc" },
    });
  }

  // 정답 미확보 + REVIEW_REQUIRED 후보만 대상
  const candidates = rows.filter((r) => {
    if (r.validationStatus !== "REVIEW_REQUIRED") return false;
    const answers = Array.isArray(r.normalizedAnswers)
      ? (r.normalizedAnswers as unknown[])
      : [];
    return answers.length === 0;
  });

  const targetCount = resolveBatchScope(
    { limit: opts.limit ?? null, all: all === true },
    candidates.length,
  );
  const targets = candidates.slice(0, targetCount);
  const results: AnswerBackfillItemResult[] = [];

  if (dryRun === true) {
    for (const row of targets) {
      logger.progress(results.length + 1, targets.length, `${row.sourceQuestionId} → 대상`);
    }
    return {
      total: targets.length,
      backfilled: 0,
      skipped: 0,
      failed: 0,
      results,
      durationMs: Date.now() - startedAt,
    };
  }

  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    const itemStartedAt = Date.now();
    try {
      const fetched = await fetchAnswersForNewbtId(source, row.sourceQuestionId, {
        limiter,
      });

      if (fetched.kind === "found") {
        // 백필 가능한 후보인지 DB 갱신. validationErrors 정리.
        const errors = stripAnswerErrors(row.validationErrors);
        const nextErrors = errors.length > 0 ? errors : [];
        const nextStatus =
          errors.length === 0
            ? CandidateValidationStatus.VALID
            : (row.validationStatus as CandidateValidationStatus);

        await db.candidateQuestion.update({
          where: { id: row.id },
          data: {
            normalizedAnswers: fetched.answers,
            validationErrors: nextErrors,
            validationStatus: nextStatus,
          },
        });

        // VALID가 되면 더 이상 리뷰가 필요 없으므로, 남아 있는 PENDING 리뷰는
        // RESOLVED로 정리한다 (candidate-review 원칙: VALID 후보는 리뷰 불필요).
        if (nextStatus === "VALID" && db.candidateReview) {
          const existing = await db.candidateReview.findUnique({
            where: { candidateQuestionId: row.id },
          });
          if (existing && existing.reviewStatus === "PENDING") {
            await db.candidateReview.update({
              where: { candidateQuestionId: row.id },
              data: { reviewStatus: "RESOLVED", resolvedAt: new Date() },
            });
          }
        }
        results.push({
          candidateId: row.id,
          sourceQuestionId: row.sourceQuestionId,
          outcome: "backfilled",
          answers: fetched.answers,
          durationMs: Date.now() - itemStartedAt,
        });
        logger.progress(
          i + 1,
          targets.length,
          `${row.sourceQuestionId} → backfilled (정답 ${fetched.answers.join(",")})`,
        );
        continue;
      }

      if (fetched.kind === "empty") {
        results.push({
          candidateId: row.id,
          sourceQuestionId: row.sourceQuestionId,
          outcome: "skipped",
          error: `answer empty: ${fetched.reason}`,
          durationMs: Date.now() - itemStartedAt,
        });
        logger.progress(i + 1, targets.length, `${row.sourceQuestionId} → skipped (정답 없음)`);
        continue;
      }

      results.push({
        candidateId: row.id,
        sourceQuestionId: row.sourceQuestionId,
        outcome: "failed",
        error: fetched.error,
        durationMs: Date.now() - itemStartedAt,
      });
      logger.progress(i + 1, targets.length, `${row.sourceQuestionId} → failed`);
    } catch (error) {
      results.push({
        candidateId: row.id,
        sourceQuestionId: row.sourceQuestionId,
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - itemStartedAt,
      });
      logger.progress(i + 1, targets.length, `${row.sourceQuestionId} → failed`);
    }
  }

  return {
    total: targets.length,
    backfilled: results.filter((r) => r.outcome === "backfilled").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
    durationMs: Date.now() - startedAt,
  };
}