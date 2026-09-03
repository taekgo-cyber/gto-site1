import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionHeading } from "@/components/common/SectionHeading";
import { getCbtCategories } from "@/lib/cbt/dal";

export const metadata: Metadata = {
  title: "화물운송종사자격시험 CBT",
  description:
    "화물운송종사자격시험 CBT 연습 문제를 풀어보세요. 과목별 문제를 선택해 바로 시작할 수 있습니다.",
  alternates: { canonical: "/cbt" },
};

export default async function CbtPage() {
  const categories = await getCbtCategories();
  const totalQuestions = categories.reduce((sum, category) => sum + category.questionCount, 0);

  return (
    <div className="min-h-screen bg-surface">
      <section className="overflow-hidden bg-brand-deep text-white">
        <Container className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm font-bold text-accent">무료 화물운송종사자격시험 학습</p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">합격을 향한 실전 연습,<br />운전픽 CBT</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-blue-100/80 sm:text-lg">회원가입 없이 과목별 문제를 풀고 바로 채점 결과와 해설을 확인하세요. 로그인하면 오답·북마크와 모의시험 기록을 저장할 수 있습니다.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              {categories.length > 0 ? <a href="#cbt-categories" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 font-bold text-white shadow-lg hover:bg-[#0f56c0]">과목 선택하기</a> : null}
              <Link href="/cbt/my" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-6 font-bold text-white hover:bg-white/15">내 오답·북마크</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CbtStat value={categories.length.toLocaleString("ko-KR")} label="학습 과정" />
            <CbtStat value={totalQuestions.toLocaleString("ko-KR")} label="공개 문제" />
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/8 p-5"><p className="text-xs font-bold tracking-[0.12em] text-blue-200">LEARNING FLOW</p><p className="mt-3 font-bold">과목 선택 → 학습 모드 → 모의고사 → 오답 복습</p><p className="mt-2 text-sm leading-6 text-white/65">현재 제공되는 학습 기능을 순서대로 활용할 수 있습니다.</p></div>
          </div>
        </Container>
      </section>

      <Container className="space-y-12 py-10 sm:py-12">
        <section id="cbt-categories" aria-labelledby="cbt-category-heading">
          <SectionHeading eyebrow="SUBJECTS" title="과목별 CBT" description="학습할 과목을 선택하면 문제 수와 과목 구성을 확인한 뒤 연습 또는 모의고사를 시작할 수 있습니다." />
          <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
            {categories.length === 0 ? (
              <EmptyState title="아직 준비 중인 시험이 없습니다." description="공개 가능한 문제가 준비되면 이곳에 과목이 표시됩니다." />
            ) : (
              <ul className={`grid gap-4 ${categories.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {categories.map((category, index) => (
                  <li key={category.id}>
                    <Link href={`/cbt/${category.slug}`} className="group flex h-full min-h-64 flex-col rounded-2xl border border-border bg-background p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg sm:p-7">
                      <div className="flex items-center justify-between"><span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-primary">{String(index + 1).padStart(2, "0")}</span><span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-muted-foreground">{category.questionCount.toLocaleString("ko-KR")}문제</span></div>
                      <h2 className="mt-5 text-2xl font-bold tracking-[-0.025em]">{category.name}</h2>
                      {category.description ? <p className="mt-3 line-clamp-3 text-[15px] leading-7 text-muted-foreground">{category.description}</p> : null}
                      <span className="mt-auto pt-5 text-sm font-bold text-primary">학습 과정 보기 <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <aside className="flex flex-col rounded-2xl bg-brand-deep p-6 text-white shadow-sm sm:p-7">
              <p className="text-xs font-black tracking-[0.13em] text-accent">QUICK START</p>
              <h3 className="mt-2 text-2xl font-bold">지금 바로 학습하기</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">정답은 서버에서 채점되며 모의고사는 제출 후에만 점수와 해설을 확인할 수 있습니다.</p>
              {categories[0] ? (
                <div className="mt-6 grid gap-2.5">
                  <Link href={`/cbt/${categories[0].slug}/practice`} className="inline-flex min-h-12 items-center justify-between rounded-lg bg-white px-4 font-bold text-brand-deep hover:bg-blue-50">과목별 연습 <span aria-hidden="true">→</span></Link>
                  <Link href={`/cbt/${categories[0].slug}/exam`} className="inline-flex min-h-12 items-center justify-between rounded-lg border border-white/20 bg-white/10 px-4 font-bold text-white hover:bg-white/15">실전 모의고사 <span aria-hidden="true">→</span></Link>
                </div>
              ) : null}
              <Link href="/cbt/my" className="mt-auto inline-flex min-h-12 items-center justify-between pt-5 text-sm font-bold text-blue-100 hover:text-white">오답·북마크 확인 <span aria-hidden="true">→</span></Link>
            </aside>
          </div>
        </section>

        <section aria-labelledby="cbt-guide-heading">
          <SectionHeading eyebrow="HOW TO USE" title="운전픽 CBT 활용 방법" description="구현된 기능을 학습 단계에 맞춰 이용하세요." />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <CbtGuide step="01" title="과목별 학습" description="한 문제씩 풀고 서버 채점 결과와 해설을 바로 확인합니다." />
            <CbtGuide step="02" title="실전 모의고사" description="정답을 미리 보지 않고 문제를 푼 뒤 제출 후 점수와 해설을 확인합니다." />
            <CbtGuide step="03" title="오답·북마크 복습" description="로그인 사용자는 저장된 오답과 북마크 문제를 다시 풀 수 있습니다." />
          </div>
        </section>
      </Container>
    </div>
  );
}

function CbtStat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/8 p-5"><p className="text-3xl font-black text-white">{value}</p><p className="mt-1 text-sm font-semibold text-blue-100/70">{label}</p></div>;
}

function CbtGuide({ step, title, description }: { step: string; title: string; description: string }) {
  return <div className="rounded-xl border border-border bg-background p-5 shadow-sm"><span className="text-xs font-black tracking-[0.12em] text-primary">STEP {step}</span><h3 className="mt-3 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>;
}
