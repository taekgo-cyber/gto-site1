import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { PracticeRunner } from "@/components/cbt/PracticeRunner";
import {
  getCbtCategoryBySlug,
  getCbtActivityQuestionIdsByUser,
  getPublicQuestionsByCategorySlug,
} from "@/lib/cbt/dal";
import { shuffleArray, shuffleQuestionOptions } from "@/lib/cbt/shuffle";
import { getCurrentUser } from "@/lib/auth/dal";
import type { PracticeMode } from "@/lib/cbt/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buildLoginUrl } from "@/lib/auth/redirect";
import Link from "next/link";

export const dynamic = "force-dynamic";

type CbtPracticePageProps = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export const metadata: Metadata = {
  title: "CBT 문제 풀이",
  robots: { index: false, follow: false },
};

function parseMode(value: string | undefined): PracticeMode {
  if (value === "wrong" || value === "bookmark") return value;
  return "none";
}

function LoginPrompt({
  mode,
  categorySlug,
}: {
  mode: PracticeMode;
  categorySlug: string;
}) {
  const modeLabel = mode === "wrong" ? "오답 복습" : "북마크 복습";
  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="rounded-lg border border-border bg-background p-8 text-center">
        <h1 className="text-xl font-bold">{modeLabel}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {modeLabel}은 로그인 후 이용할 수 있습니다. 틀린 문제와 북마크를
          저장하려면 로그인하세요.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={buildLoginUrl(`/cbt/${categorySlug}/practice?mode=${mode}`)}>
            <Button className="w-full sm:w-auto">로그인</Button>
          </Link>
          <Link href={`/cbt/${categorySlug}`}>
            <Button variant="outline" className="w-full sm:w-auto">
              시험 소개로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    </Container>
  );
}

export default async function CbtPracticePage(props: CbtPracticePageProps) {
  const { categorySlug } = await props.params;
  const { mode: modeParam } = await props.searchParams;
  const mode = parseMode(modeParam);

  const [category, questions] = await Promise.all([
    getCbtCategoryBySlug(categorySlug),
    getPublicQuestionsByCategorySlug(categorySlug),
  ]);

  if (!category || questions.length === 0) notFound();

  const user = await getCurrentUser();

  let pool = questions;
  let initialBookmarked: string[] = [];

  if (user) {
    const bookmarkIds = await getCbtActivityQuestionIdsByUser(
      user.id,
      categorySlug,
      "bookmark",
    );
    initialBookmarked = bookmarkIds;

    if (mode === "wrong" || mode === "bookmark") {
      const ids = await getCbtActivityQuestionIdsByUser(user.id, categorySlug, mode);
      const idSet = new Set(ids);
      pool = questions.filter((question) => idSet.has(question.id));
    }
  } else if (mode !== "none") {
    return <LoginPrompt mode={mode} categorySlug={categorySlug} />;
  }

  if (pool.length === 0) {
    const modeLabel = mode === "wrong" ? "오답" : "북마크";
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <div className="rounded-lg border border-border bg-background p-8 text-center">
          <h1 className="text-xl font-bold">{modeLabel} 문제가 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            아직 {modeLabel}한 문제가 없습니다.
          </p>
          <Link href={`/cbt/${categorySlug}`} className="mt-6 block">
            <Button variant="outline">시험 소개로 돌아가기</Button>
          </Link>
        </div>
      </Container>
    );
  }

  // 서버 컴포넌트에서 문제/보기 순서를 랜덤화해 클라이언트에 전달한다.
  // practice 페이지는 force-dynamic이므로 요청마다 새로운 결과가 생성되고,
  // SSR 결과와 클라이언트 hydration 배열이 동일해 mismatch가 없다.
  const shuffled = shuffleArray(
    pool.map((question) => ({
      ...question,
      options: shuffleQuestionOptions(question.options),
    })),
  );

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      {mode !== "none" ? (
        <Badge className="self-start">
          {mode === "wrong" ? "오답 복습" : "북마크 복습"}
        </Badge>
      ) : null}
      <PracticeRunner
        categoryName={category.name}
        categorySlug={category.slug}
        questions={shuffled}
        mode={mode}
        isLoggedIn={user !== null}
        initialBookmarkedIds={initialBookmarked}
      />
    </Container>
  );
}
