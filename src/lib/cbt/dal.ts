import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { QuestionStatus } from "@/generated/prisma/enums";
import { parseCbtOptions } from "./options";
import type { CbtCategoryPublic, PublicCbtQuestion } from "./types";

export type CbtCategoryDetail = CbtCategoryPublic & {
  questionCount: number;
};

export const getCbtCategories = cache(async (): Promise<CbtCategoryPublic[]> => {
  const categories = await prisma.cbtCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      _count: { select: { questions: { where: { status: "PUBLISHED" } } } },
    },
  });

  return categories
    .filter((category) => category._count.questions > 0)
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      questionCount: category._count.questions,
    }));
});

export const getCbtCategoryBySlug = cache(
  async (slug: string): Promise<CbtCategoryDetail | null> => {
    const category = await prisma.cbtCategory.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        _count: { select: { questions: { where: { status: "PUBLISHED" } } } },
      },
    });

    if (!category) return null;

    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      questionCount: category._count.questions,
    };
  },
);

export type CbtSubjectCount = {
  subject: string;
  questionCount: number;
};

export const getSubjectCountsByCategorySlug = cache(
  async (slug: string): Promise<CbtSubjectCount[]> => {
    const category = await prisma.cbtCategory.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!category) return [];

    const questions = await prisma.cbtQuestion.findMany({
      where: { categoryId: category.id, status: "PUBLISHED" },
      select: { subject: true },
      orderBy: { createdAt: "asc" },
    });

    const countBySubject = new Map<string, number>();
    for (const question of questions) {
      countBySubject.set(
        question.subject,
        (countBySubject.get(question.subject) ?? 0) + 1,
      );
    }

    return Array.from(countBySubject, ([subject, questionCount]) => ({
      subject,
      questionCount,
    }));
  },
);

export const getPublicQuestionsByCategorySlug = cache(
  async (slug: string): Promise<PublicCbtQuestion[]> => {
    const questions = await prisma.cbtQuestion.findMany({
      where: { category: { slug, isActive: true }, status: "PUBLISHED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        subject: true,
        questionText: true,
        options: true,
        imageUrl: true,
      },
    });

    return questions.map((question) => ({
      id: question.id,
      subject: question.subject,
      questionText: question.questionText,
      options: parseCbtOptions(question.options),
      imageUrl: question.imageUrl,
    }));
  },
);

export type CbtQuestionForGrading = {
  id: string;
  status: QuestionStatus;
  options: unknown;
  correctOption: number;
  explanation: string | null;
};

export async function getQuestionAnswerForGrading(
  id: string,
): Promise<CbtQuestionForGrading | null> {
  const question = await prisma.cbtQuestion.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      options: true,
      correctOption: true,
      explanation: true,
    },
  });

  return question;
}

// ---------------------------------------------------------------------------
// 모의고사 일괄 채점
// ---------------------------------------------------------------------------

export type CbtQuestionForBatchGrading = {
  id: string;
  categoryId: string;
  subject: string;
  status: QuestionStatus;
  options: unknown;
  correctOption: number;
  explanation: string | null;
};

/**
 * questionId들을 한 번에 조회한다 (N+1 방지).
 * 상태/카테고리 검증은 호출부(service)에서 수행한다.
 */
export async function getQuestionsForGradingByIds(
  ids: string[],
): Promise<CbtQuestionForBatchGrading[]> {
  if (ids.length === 0) return [];

  return prisma.cbtQuestion.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      categoryId: true,
      subject: true,
      status: true,
      options: true,
      correctOption: true,
      explanation: true,
    },
  });
}

// ---------------------------------------------------------------------------
// 사용자별 문제 활동 (CbtQuestionActivity, upsert 기반 최신 상태)
// ---------------------------------------------------------------------------

export async function upsertQuestionActivity(input: {
  userId: string;
  questionId: string;
  isCorrect: boolean;
  selectedOptionId: number;
}): Promise<void> {
  await prisma.cbtQuestionActivity.upsert({
    where: {
      userId_questionId: {
        userId: input.userId,
        questionId: input.questionId,
      },
    },
    update: {
      lastIsCorrect: input.isCorrect,
      lastSelectedOption: input.selectedOptionId,
      attemptCount: { increment: 1 },
      correctCount: { increment: input.isCorrect ? 1 : 0 },
      lastAttemptedAt: new Date(),
    },
    create: {
      userId: input.userId,
      questionId: input.questionId,
      lastIsCorrect: input.isCorrect,
      lastSelectedOption: input.selectedOptionId,
      attemptCount: 1,
      correctCount: input.isCorrect ? 1 : 0,
      lastAttemptedAt: new Date(),
    },
  });
}

export async function getQuestionActivity(
  userId: string,
  questionId: string,
): Promise<{ bookmarked: boolean } | null> {
  return prisma.cbtQuestionActivity.findUnique({
    where: { userId_questionId: { userId, questionId } },
    select: { bookmarked: true },
  });
}

export async function upsertBookmark(
  userId: string,
  questionId: string,
  bookmarked: boolean,
): Promise<void> {
  await prisma.cbtQuestionActivity.upsert({
    where: { userId_questionId: { userId, questionId } },
    update: { bookmarked },
    create: { userId, questionId, bookmarked },
  });
}

export type CbtActivityMode = "wrong" | "bookmark";

/**
 * 로그인 사용자가 해당 카테고리에서 오답(lastIsCorrect=false) 또는
 * 북마크한 PUBLISHED 문제 id 목록을 반환한다.
 */
export async function getCbtActivityQuestionIdsByUser(
  userId: string,
  categorySlug: string,
  mode: CbtActivityMode,
): Promise<string[]> {
  const rows = await prisma.cbtQuestionActivity.findMany({
    where: {
      userId,
      question: { category: { slug: categorySlug }, status: "PUBLISHED" },
      ...(mode === "wrong"
        ? { lastIsCorrect: false }
        : { bookmarked: true }),
    },
    select: { questionId: true },
  });
  return rows.map((row) => row.questionId);
}

export async function getCbtUserCategoryProgress(
  userId: string,
  categorySlug: string,
): Promise<{ wrongCount: number; bookmarkCount: number }> {
  const [wrongCount, bookmarkCount] = await Promise.all([
    prisma.cbtQuestionActivity.count({
      where: {
        userId,
        lastIsCorrect: false,
        question: { category: { slug: categorySlug }, status: "PUBLISHED" },
      },
    }),
    prisma.cbtQuestionActivity.count({
      where: {
        userId,
        bookmarked: true,
        question: { category: { slug: categorySlug }, status: "PUBLISHED" },
      },
    }),
  ]);
  return { wrongCount, bookmarkCount };
}

export type CbtUserProgressItem = {
  categorySlug: string;
  categoryName: string;
  wrongCount: number;
  bookmarkCount: number;
};

/** 전체 카테고리 기준 오답/북마크 수를 카테고리별로 집계한다. */
export async function getCbtUserProgress(
  userId: string,
): Promise<CbtUserProgressItem[]> {
  const activities = await prisma.cbtQuestionActivity.findMany({
    where: {
      userId,
      question: { status: "PUBLISHED" },
      OR: [{ lastIsCorrect: false }, { bookmarked: true }],
    },
    select: {
      lastIsCorrect: true,
      bookmarked: true,
      question: {
        select: { category: { select: { slug: true, name: true } } },
      },
    },
  });

  const map = new Map<string, CbtUserProgressItem>();
  for (const activity of activities) {
    const slug = activity.question.category.slug;
    const item =
      map.get(slug) ?? {
        categorySlug: slug,
        categoryName: activity.question.category.name,
        wrongCount: 0,
        bookmarkCount: 0,
      };
    if (activity.lastIsCorrect === false) item.wrongCount += 1;
    if (activity.bookmarked) item.bookmarkCount += 1;
    map.set(slug, item);
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// 모의고사 기록 (CbtExamRecord)
// ---------------------------------------------------------------------------

export async function createExamRecord(input: {
  userId: string;
  categoryId: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  passed: boolean;
  durationSeconds: number | null;
  details: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.cbtExamRecord.create({
    data: {
      userId: input.userId,
      categoryId: input.categoryId,
      totalQuestions: input.totalQuestions,
      correctCount: input.correctCount,
      score: input.score,
      passed: input.passed,
      durationSeconds: input.durationSeconds,
      details: input.details,
    },
  });
}

export type CbtExamRecordItem = {
  id: string;
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  durationSeconds: number | null;
  createdAt: Date;
  category: { name: string; slug: string };
};

export async function getRecentExamRecords(
  userId: string,
  take = 5,
): Promise<CbtExamRecordItem[]> {
  return prisma.cbtExamRecord.findMany({
    where: { userId },
    select: {
      id: true,
      score: true,
      passed: true,
      correctCount: true,
      totalQuestions: true,
      durationSeconds: true,
      createdAt: true,
      category: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
