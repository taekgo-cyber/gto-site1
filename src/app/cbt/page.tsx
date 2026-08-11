import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCbtCategories } from "@/lib/cbt/dal";

export const metadata: Metadata = {
  title: "화물운송종사자격시험 CBT",
  description:
    "화물운송종사자격시험 CBT 연습 문제를 풀어보세요. 과목별 문제를 선택해 바로 시작할 수 있습니다.",
  alternates: { canonical: "/cbt" },
};

export default async function CbtPage() {
  const categories = await getCbtCategories();

  return (
    <Container className="space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">화물운송종사자격시험 CBT</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          회원가입 없이 바로 문제를 풀어볼 수 있습니다.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          아직 준비 중인 시험이 없습니다.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={`/cbt/${category.slug}`}>
                <Card className="h-full transition-colors hover:bg-surface">
                  <CardHeader>
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {category.description ? (
                      <p className="text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm font-medium text-primary">
                      문제 {category.questionCount}개
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
