import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getCbtUserProgress, getRecentExamRecords } from "@/lib/cbt/dal";
import { requireUser } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 CBT",
  robots: { index: false, follow: false },
};

export default async function CbtMyPage() {
  const user = await requireUser();
  const [progress, records] = await Promise.all([
    getCbtUserProgress(user.id),
    getRecentExamRecords(user.id, 5),
  ]);

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <h1 className="text-2xl font-bold">내 CBT</h1>

      <Card>
        <CardHeader>
          <CardTitle>오답 / 북마크</CardTitle>
        </CardHeader>
        <CardContent>
          {progress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 저장된 오답과 북마크가 없습니다. 문제를 풀고 나면 여기에
              표시됩니다.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {progress.map((item) => (
                <li key={item.categorySlug} className="py-3">
                  <p className="text-sm font-semibold">{item.categoryName}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      오답 {item.wrongCount}문제
                    </span>
                    <span className="text-muted-foreground">
                      북마크 {item.bookmarkCount}문제
                    </span>
                    {item.wrongCount > 0 ? (
                      <Link
                        href={`/cbt/${item.categorySlug}/practice?mode=wrong`}
                        className="text-primary underline"
                      >
                        오답 다시 풀기
                      </Link>
                    ) : null}
                    {item.bookmarkCount > 0 ? (
                      <Link
                        href={`/cbt/${item.categorySlug}/practice?mode=bookmark`}
                        className="text-primary underline"
                      >
                        북마크 풀기
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 모의고사</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 모의고사 기록이 없습니다. 모의고사를 치고 나면 점수와 합격
              여부가 저장됩니다.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {records.map((record) => (
                <li key={record.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{record.category.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.createdAt.toLocaleDateString("ko-KR")} ·{" "}
                      {record.correctCount}/{record.totalQuestions} 정답
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold">{record.score}점</p>
                    <span
                      className={`text-xs font-medium ${
                        record.passed ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {record.passed ? "합격" : "불합격"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link href="/cbt">
              <Button variant="outline" size="sm">
                CBT 시험 목록 보기
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Container>
  );
}
