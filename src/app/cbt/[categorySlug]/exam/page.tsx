import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { ExamRunner } from "@/components/cbt/ExamRunner";
import {
  getCbtCategoryBySlug,
  getPublicQuestionsByCategorySlug,
} from "@/lib/cbt/dal";
import { buildExamSet } from "@/lib/cbt/exam";
import { CBT_EXAM_CONFIG } from "@/lib/cbt/constants";
import { shuffleQuestionOptions } from "@/lib/cbt/shuffle";
import { getCurrentUser } from "@/lib/auth/dal";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

type CbtExamPageProps = {
  params: Promise<{ categorySlug: string }>;
};

export const metadata: Metadata = {
  title: "CBT 모의고사",
  robots: { index: false, follow: false },
};

export default async function CbtExamPage(props: CbtExamPageProps) {
  const { categorySlug } = await props.params;
  const [category, questions] = await Promise.all([
    getCbtCategoryBySlug(categorySlug),
    getPublicQuestionsByCategorySlug(categorySlug),
  ]);

  if (!category || questions.length === 0) notFound();

  const user = await getCurrentUser();

  // 시험 세트 구성(과목별 quota, 가용 문항 고려) + 보기 표시 순서 셔플.
  // 정답/해설은 클라이언트로 전달하지 않는다.
  const examSet = buildExamSet(questions).map((question) => ({
    ...question,
    options: shuffleQuestionOptions(question.options),
  }));

  if (examSet.length < CBT_EXAM_CONFIG.minExamQuestions) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <div className="rounded-lg border border-border bg-background p-8 text-center">
          <h1 className="text-2xl font-bold">{category.name} 모의고사</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            모의고사 준비 중입니다. 문제가 충분히 준비되면 이용할 수 있습니다.
          </p>
          <Link href={`/cbt/${category.slug}`} className="mt-6 block">
            <Button variant="outline">시험 소개로 돌아가기</Button>
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <ExamRunner
        categoryName={category.name}
        categorySlug={category.slug}
        questions={examSet}
        isLoggedIn={user !== null}
        timeLimitMinutes={CBT_EXAM_CONFIG.timeLimitMinutes}
      />
    </Container>
  );
}
