import { cache } from "react";
import { prisma } from "@/lib/prisma";
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
