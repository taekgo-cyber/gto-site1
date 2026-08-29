import Link from "next/link";
import { Container } from "@/components/common/Container";
import { JobCard } from "@/components/jobs/JobCard";
import { LeaseCard } from "@/components/lease/LeaseCard";
import { AdPlacementSlot } from "@/components/ads/AdPlacementSlot";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";
import { getJobPostList } from "@/lib/jobs/dal";
import { getPostList } from "@/lib/posts/dal";
import { listPublicAdvertisementCampaigns } from "@/lib/monetization/ads";

const HOME_JOB_COUNT = 5;
const HOME_LEASE_COUNT = 5;

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
  const [jobResult, leaseResult, homeAds] = await Promise.all([
    getJobPostList({ page: 1 }),
    getPostList({ page: 1, pageSize: HOME_LEASE_COUNT }),
    listPublicAdvertisementCampaigns({ placementCode: "HOME_TOP", limit: 3 }),
  ]);

  const jobs = jobResult.items.slice(0, HOME_JOB_COUNT);

  return (
    <div className="bg-surface">
      <section className="border-b border-border bg-background">
        <Container className="flex flex-col items-start gap-4 py-10 sm:py-14">
          <h1 className="text-2xl font-bold sm:text-3xl">
            운송/화물차 정보 포털
          </h1>
          <p className="max-w-xl text-[15px] leading-6 text-muted-foreground sm:text-base">
            구인·구직부터 지입 차량, 업체 정보까지 — 필요한 정보를 검색 한
            번으로 빠르게 찾을 수 있습니다.
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

      <AdPlacementSlot campaigns={homeAds} />

      <section className="border-b border-border bg-background">
        <Container className="py-8">
          <h2 className="text-lg font-bold">주요 서비스 바로가기</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            필요한 곳으로 바로 이동하세요.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRIMARY_SHORTCUTS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[96px] flex-col justify-center gap-1 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="text-[16px] font-semibold leading-none">
                  {item.title}
                </span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SECONDARY_SHORTCUTS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[84px] flex-col justify-center gap-1 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

      <Container className="space-y-10 py-8">
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold">최신 구인공고</h2>
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
            <h2 className="text-lg font-bold">최신 지입 구인/구직</h2>
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
