import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { PracticeRunner } from "@/components/cbt/PracticeRunner";
import {
  getCbtCategoryBySlug,
  getPublicQuestionsByCategorySlug,
} from "@/lib/cbt/dal";

export const dynamic = "force-dynamic";

type CbtPracticePageProps = {
  params: Promise<{ categorySlug: string }>;
};

export const metadata: Metadata = {
  title: "CBT 문제 풀이",
  robots: { index: false, follow: false },
};

export default async function CbtPracticePage(props: CbtPracticePageProps) {
  const { categorySlug } = await props.params;
  const [category, questions] = await Promise.all([
    getCbtCategoryBySlug(categorySlug),
    getPublicQuestionsByCategorySlug(categorySlug),
  ]);

  if (!category || questions.length === 0) notFound();

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <PracticeRunner
        categoryName={category.name}
        categorySlug={category.slug}
        questions={questions}
      />
    </Container>
  );
}
