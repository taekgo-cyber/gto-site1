import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/common/Container";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionHeading } from "@/components/common/SectionHeading";
import { JobCard } from "@/components/jobs/JobCard";
import { LeaseCard } from "@/components/lease/LeaseCard";
import {
  HomepageGeneralSponsoredSection,
  HomepagePremiumSection,
  HomepagePrimeCommercialZone,
} from "@/components/ads/HomepageAdvertisementSections";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";
import { getJobPostList } from "@/lib/jobs/dal";
import { getPostList } from "@/lib/posts/dal";
import { listHomepageAdvertisementInventory } from "@/lib/monetization/homepage-ads";
import { resolveHomepageAdvertisementFixture } from "@/lib/monetization/homepage-fixtures";

const HOME_JOB_COUNT = 3;
const HOME_LEASE_OPPORTUNITY_COUNT = 2;
const HOME_LEASE_LATEST_COUNT = 3;

export const dynamic = "force-dynamic";

const QUICK_FILTERS = [
  { href: "/jobs?type=JOB", label: "운전기사 구인", icon: "01" },
  { href: "/jobs?type=TRANSPORT", label: "운송·배차", icon: "02" },
  { href: "/lease?type=HIRE", label: "지입 구인", icon: "03" },
  { href: "/lease?type=SEEK", label: "지입 구직", icon: "04" },
] as const;

const UTILITY_LINKS = [
  {
    href: "/cbt",
    title: "CBT 시험",
    description: "과목별 학습과 모의시험",
    mark: "CBT",
  },
  {
    href: "/companies",
    title: "업체정보",
    description: "검토 완료 운송 업체 찾기",
    mark: "CO",
  },
  {
    href: "/blog",
    title: "운전·화물 가이드",
    description: "현장에 필요한 실무 정보",
    mark: "TIP",
  },
  {
    href: "/support",
    title: "고객지원",
    description: "문의와 이용 도움",
    mark: "Q&A",
  },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ adFixture?: string }>;
}) {
  const { adFixture } = await searchParams;
  const homeAds = resolveHomepageAdvertisementFixture(adFixture, process.env.NODE_ENV)
    ?? await listHomepageAdvertisementInventory();
  const paidAds = [...homeAds.main, ...homeAds.premium, ...homeAds.general];
  const paidJobIds = paidAds.flatMap((advertisement) => advertisement.jobPostId ? [advertisement.jobPostId] : []);
  const paidLeaseIds = paidAds.flatMap((advertisement) => advertisement.leasePostId ? [advertisement.leasePostId] : []);
  const [jobResult, leaseResult] = await Promise.all([
    getJobPostList({ page: 1, excludeIds: paidJobIds }),
    getPostList(
      { page: 1, pageSize: HOME_LEASE_OPPORTUNITY_COUNT + HOME_LEASE_LATEST_COUNT },
      { excludeIds: paidLeaseIds },
    ),
  ]);

  const jobs = jobResult.items.slice(0, HOME_JOB_COUNT);
  const leaseOpportunities = leaseResult.items.slice(0, HOME_LEASE_OPPORTUNITY_COUNT);
  const latestLeasePosts = leaseResult.items.slice(
    HOME_LEASE_OPPORTUNITY_COUNT,
    HOME_LEASE_OPPORTUNITY_COUNT + HOME_LEASE_LATEST_COUNT,
  );

  return (
    <div className="bg-surface">
      <section className="overflow-hidden bg-brand-deep text-white">
        <Container className="grid gap-6 py-6 lg:min-h-[22rem] lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-9 lg:py-6">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
              <span className="h-2 w-2 rounded-full bg-accent" />
              화물·운전 일자리 전문 플랫폼
            </div>
            <h1 className="mt-3 text-[2rem] font-black leading-[1.14] tracking-[-0.045em] sm:text-[2.65rem] lg:text-[2.75rem]">
              운전하는 사람과<br className="hidden sm:block" /> 운송하는 기업을 잇습니다
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-6 text-blue-100/80 sm:text-lg sm:leading-7">
              구인공고·지입·운송업체·CBT·운전자 실무정보를 한 곳에서 빠르고 정확하게 찾으세요.
            </p>

            <div className="mt-4 max-w-3xl rounded-2xl bg-white p-2 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
              <UnifiedSearchForm
                formId="home-search"
                inputId="home-search-input"
                ariaLabel="홈 통합검색"
                placeholder="예: 인천 5톤 지입, 화물 운송"
                variant="hero"
              />
            </div>
            <p className="mt-2 text-xs font-medium text-blue-100/70">구인공고 · 지입/차량 · 업체정보 · 블로그를 통합 검색합니다.</p>

            <nav aria-label="빠른 조건 찾기" className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {QUICK_FILTERS.map((item) => (
                <Link key={item.href} href={item.href} className="group inline-flex min-h-11 items-center rounded-lg border border-white/15 bg-white/8 px-3.5 text-sm font-semibold text-white transition-colors hover:border-white/35 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <span aria-hidden="true" className="mr-2 text-[10px] font-black tracking-wide text-accent">{item.icon}</span>{item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="relative hidden min-h-[18.5rem] overflow-hidden rounded-[1.5rem] border border-white/10 shadow-2xl lg:block">
            <Image src="/images/blog/one-ton-cargo-job-beginner-guide-featured.webp" alt="화물차 옆에서 운송 업무를 확인하는 운전자" fill priority sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/85 via-brand-deep/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <p className="text-xs font-bold tracking-[0.14em] text-accent">DRIVER FIRST</p>
              <p className="mt-2 max-w-sm text-lg font-bold leading-7">현장에서 필요한 조건을 먼저 보고, 더 빠르게 비교하세요.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-white/85">
                <span className="rounded-full bg-white/12 px-3 py-1.5">구인·운송</span>
                <span className="rounded-full bg-white/12 px-3 py-1.5">지입·차량</span>
                <span className="rounded-full bg-white/12 px-3 py-1.5">자격·실무</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <HomepagePrimeCommercialZone inventory={homeAds} />
      <HomepagePremiumSection inventory={homeAds} />

      <section className="border-b border-white/10 bg-brand-navy text-white">
        <Container className="py-9 sm:py-11">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-accent">LEASE &amp; VEHICLES</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] sm:text-3xl">지입·차량 기회</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                차량·톤수, 예상 수익과 운행 조건을 먼저 비교하고 나에게 맞는 지입 정보를 찾으세요.
              </p>
            </div>
            <Link href="/lease" className="inline-flex min-h-11 shrink-0 items-center font-bold text-white hover:text-blue-100">
              전체 지입 정보 보기 <span aria-hidden="true" className="ml-1">→</span>
            </Link>
          </div>
          {leaseOpportunities.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/15 bg-white/8 px-5 py-6 text-sm text-white/70">
              새 지입·차량 정보가 등록되면 차량과 수익 조건을 이곳에서 바로 비교할 수 있습니다.
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 lg:grid-cols-2">
              {leaseOpportunities.map((post) => (
                <li key={post.id}><LeaseCard post={post} /></li>
              ))}
            </ul>
          )}
        </Container>
      </section>

      <section className="border-b border-border bg-surface">
        <Container className="py-9 sm:py-10">
          <SectionHeading eyebrow="DRIVER SERVICES" title="운전 생활에 필요한 서비스" description="자격시험부터 업체와 실무 정보까지, 실제 제공 중인 기능만 모았습니다." />
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {UTILITY_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="group flex min-h-28 items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-5">
                <span aria-hidden="true" className="flex h-10 min-w-10 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-black text-primary">{item.mark}</span>
                <span className="min-w-0">
                  <span className="block font-bold sm:text-lg">{item.title}</span>
                  <span className="mt-1 hidden text-sm leading-6 text-muted-foreground sm:block">{item.description}</span>
                  <span className="mt-2 inline-flex text-sm font-bold text-primary">바로가기 <span aria-hidden="true" className="ml-1 transition-transform group-hover:translate-x-0.5">→</span></span>
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <HomepageGeneralSponsoredSection inventory={homeAds} />

      <section className="border-b border-border bg-background">
        <Container className="py-10 sm:py-12">
          <SectionHeading eyebrow="LATEST" title="새로 등록된 운송 정보" description="유료 광고와 겹치지 않는 최신 구인·지입 정보를 모았습니다." />

          <div className="mt-7 grid gap-10 lg:grid-cols-2 lg:gap-8">
            <section aria-labelledby="latest-jobs" className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                <h3 id="latest-jobs" className="text-xl font-bold">최신 구인공고</h3>
                <Link
                  href="/jobs"
                  aria-label="구인공고 전체 보기"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  전체 보기 →
                </Link>
              </div>
              {jobs.length === 0 ? (
                <EmptyState title="등록된 구인공고가 없습니다." description="새 공고가 등록되면 이 영역에서 바로 확인할 수 있습니다." />
              ) : (
                <ul className="space-y-3">
                  {jobs.map((post) => (
                    <li key={post.id}>
                      <JobCard post={post} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="latest-lease" className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                <h3 id="latest-lease" className="text-xl font-bold">최신 지입·차량</h3>
                <Link
                  href="/lease"
                  aria-label="지입 전체 보기"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  전체 보기 →
                </Link>
              </div>
              {latestLeasePosts.length === 0 ? (
                <EmptyState title="등록된 지입 정보가 없습니다." description="새 지입·차량 정보가 등록되면 이 영역에서 바로 확인할 수 있습니다." />
              ) : (
                <ul className="space-y-3">
                  {latestLeasePosts.map((post) => (
                    <li key={post.id}>
                      <LeaseCard post={post} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Container>
      </section>

    </div>
  );
}
