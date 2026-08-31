import Link from "next/link";
import { Container } from "@/components/common/Container";
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

const HOME_JOB_COUNT = 5;
const HOME_LEASE_COUNT = 5;

export const dynamic = "force-dynamic";

const PRIMARY_SHORTCUTS = [
  {
    href: "/jobs",
    title: "구인공고",
    description: "운송·물류 일자리를 찾습니다",
  },
  {
    href: "/lease",
    title: "지입",
    description: "지입 차량·구인/구직 정보",
  },
  {
    href: "/cbt",
    title: "CBT 시험",
    description: "화물운송자격 모의시험",
  },
  {
    href: "/companies",
    title: "업체정보",
    description: "검증된 운송 업체 찾기",
  },
] as const;

const PROFESSIONAL_FILTERS = [
  { href: "/jobs?type=JOB", label: "운전기사 구인" },
  { href: "/jobs?type=TRANSPORT", label: "운송·배차" },
  { href: "/lease?type=HIRE", label: "지입 구인" },
  { href: "/lease?type=SEEK", label: "지입 구직" },
  { href: "/companies", label: "운송업체 찾기" },
] as const;

const SECONDARY_SHORTCUTS = [
  {
    href: "/blog",
    title: "블로그",
    description: "화물·지입 정보 글",
  },
  {
    href: "/support",
    title: "고객지원",
    description: "문의·도움 요청",
  },
  {
    href: "/mypage/lead",
    title: "구직정보 등록",
    description: "내 이력·조건 등록",
  },
] as const;

export default async function Home() {
  const homeAds = await listHomepageAdvertisementInventory();
  const paidAds = [...homeAds.main, ...homeAds.premium, ...homeAds.general];
  const paidJobIds = paidAds.flatMap((advertisement) => advertisement.jobPostId ? [advertisement.jobPostId] : []);
  const paidLeaseIds = paidAds.flatMap((advertisement) => advertisement.leasePostId ? [advertisement.leasePostId] : []);
  const [jobResult, leaseResult] = await Promise.all([
    getJobPostList({ page: 1, excludeIds: paidJobIds }),
    getPostList({ page: 1, pageSize: HOME_LEASE_COUNT }, { excludeIds: paidLeaseIds }),
  ]);

  const jobs = jobResult.items.slice(0, HOME_JOB_COUNT);

  return (
    <div className="bg-surface">
      <section className="border-b border-border bg-background">
        <Container className="flex flex-col items-start gap-4 py-10 sm:py-14">
          <p className="text-sm font-semibold text-primary">운송 일자리와 사업 정보를 한곳에서</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            내 조건에 맞는 운송 정보를<br className="hidden sm:block" /> 빠르게 찾으세요
          </h1>
          <p className="max-w-xl text-[15px] leading-6 text-muted-foreground sm:text-base">
            구인공고부터 지입·매물, 승인 업체와 실무 정보까지 검색 한 번으로
            비교하고 상세 내용을 확인할 수 있습니다.
          </p>
          <div className="w-full max-w-2xl">
            <UnifiedSearchForm
              formId="home-search"
              inputId="home-search-input"
              ariaLabel="홈 통합검색"
              placeholder="예: 5톤 지입, 화물 운송"
              variant="hero"
            />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            구인공고 · 지입/매물 · 업체정보 · 블로그를 통합 검색합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/jobs"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              구인공고 보기
            </Link>
            <Link
              href="/lease"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              지입 구인/구직 보기
            </Link>
          </div>
        </Container>
      </section>

      <section className="border-b border-border bg-background">
        <Container className="py-7">
          <h2 className="text-lg font-bold">운송 전문 정보 바로 찾기</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            필요한 업무와 조건으로 바로 이동하세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PROFESSIONAL_FILTERS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-[15px] font-medium transition-colors hover:border-primary/35 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <HomepagePrimeCommercialZone inventory={homeAds} />
      <HomepagePremiumSection inventory={homeAds} />

      <section className="border-b border-border bg-background">
        <Container className="py-10 sm:py-12">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold text-primary">LEASE &amp; VEHICLES</p>
              <h2 className="mt-1 text-2xl font-bold">지입·차량 기회</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">운행 지역, 차량 조건과 예상 수입을 확인하고 나에게 맞는 지입 정보를 찾아보세요.</p>
            </div>
            <Link href="/lease" className="inline-flex min-h-11 items-center font-semibold text-primary">지입 정보 전체 보기 <span aria-hidden="true">→</span></Link>
          </div>
        </Container>
      </section>

      <section className="border-b border-border bg-surface">
        <Container className="py-10 sm:py-12">
          <h2 className="text-2xl font-bold">자격·업체·실무 정보</h2>
          <p className="mt-1 text-sm text-muted-foreground">현장에서 다시 찾게 되는 운송 실무 서비스를 모았습니다.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...PRIMARY_SHORTCUTS.slice(2), ...SECONDARY_SHORTCUTS].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[96px] flex-col justify-center gap-1 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="text-[15px] font-semibold leading-none">
                  {item.title}
                </span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <HomepageGeneralSponsoredSection inventory={homeAds} />

      <Container className="space-y-12 py-10">
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">RECRUITMENT</p>
              <h2 className="mt-1 text-xl font-bold">최신 구인공고</h2>
              <p className="mt-1 text-sm text-muted-foreground">지역, 차종·톤수와 급여 조건을 한눈에 비교하세요.</p>
            </div>
            <Link
              href="/jobs"
              aria-label="구인공고 전체 보기"
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              전체 보기 →
            </Link>
          </div>
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
              등록된 구인공고가 없습니다.
            </div>
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

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">LEASE &amp; LISTINGS</p>
              <h2 className="mt-1 text-xl font-bold">최신 지입 구인/구직</h2>
              <p className="mt-1 text-sm text-muted-foreground">운행 지역과 차량 조건, 수입 정보를 빠르게 살펴보세요.</p>
            </div>
            <Link
              href="/lease"
              aria-label="지입 전체 보기"
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              전체 보기 →
            </Link>
          </div>
          {leaseResult.items.length === 0 ? (
            <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
              등록된 지입 게시글이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {leaseResult.items.map((post) => (
                <li key={post.id}>
                  <LeaseCard post={post} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>
    </div>
  );
}
