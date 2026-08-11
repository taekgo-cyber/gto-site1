import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  getCbtCategoryBySlug,
  getCbtUserCategoryProgress,
  getSubjectCountsByCategorySlug,
} from "@/lib/cbt/dal";
import { getCurrentUser } from "@/lib/auth/dal";

type CbtCategoryPageProps = {
  params: Promise<{ categorySlug: string }>;
};

export async function generateMetadata(
  props: CbtCategoryPageProps,
): Promise<Metadata> {
  const { categorySlug } = await props.params;
  const category = await getCbtCategoryBySlug(categorySlug);
  if (!category) return {};

  return {
    title: category.name,
    description:
      category.description ??
      `${category.name} CBT 연습 문제 ${category.questionCount}개를 풀어보세요.`,
    alternates: { canonical: `/cbt/${category.slug}` },
  };
}

export default async function CbtCategoryPage(props: CbtCategoryPageProps) {
  const { categorySlug } = await props.params;
  const [category, subjectCounts, user] = await Promise.all([
    getCbtCategoryBySlug(categorySlug),
    getSubjectCountsByCategorySlug(categorySlug),
    getCurrentUser(),
  ]);

  if (!category || category.questionCount === 0) notFound();

  const progress = user
    ? await getCbtUserCategoryProgress(user.id, categorySlug)
    : null;

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <Link
        href="/cbt"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← CBT 목록으로
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{category.name}</h1>
        {category.description ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {category.description}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>과목 구성</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {subjectCounts.map((item) => (
              <li
                key={item.subject}
                className="flex items-center justify-between py-3"
              >
                <span className="text-sm font-medium">{item.subject}</span>
                <span className="text-sm text-muted-foreground">
                  {item.questionCount}문항
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
            전체 {category.questionCount}문항 · 한 문제씩 풀고 바로 채점 결과와
            해설을 확인할 수 있습니다.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/cbt/${category.slug}/practice`} className="block">
          <Button size="lg" className="w-full">
            학습 모드 시작
          </Button>
        </Link>
        <Link href={`/cbt/${category.slug}/exam`} className="block">
          <Button variant="outline" size="lg" className="w-full">
            모의고사 시작
          </Button>
        </Link>
      </div>

      {progress ? (
        <Card>
          <CardHeader>
            <CardTitle>내 학습</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-center justify-between">
                <span className="text-sm">오답 노트</span>
                <Link
                  href={`/cbt/${category.slug}/practice?mode=wrong`}
                  className="text-sm font-medium text-primary"
                >
                  {progress.wrongCount}문제 {progress.wrongCount > 0 ? "다시 풀기" : ""}
                </Link>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-sm">북마크</span>
                <Link
                  href={`/cbt/${category.slug}/practice?mode=bookmark`}
                  className="text-sm font-medium text-primary"
                >
                  {progress.bookmarkCount}문제 {progress.bookmarkCount > 0 ? "다시 풀기" : ""}
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
