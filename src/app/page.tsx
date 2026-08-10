import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { JobCard } from "@/components/jobs/JobCard";
import { LeaseCard } from "@/components/lease/LeaseCard";
import { getJobPostList } from "@/lib/jobs/dal";
import { getPostList } from "@/lib/posts/dal";
import { DEFAULT_PAGE_SIZE } from "@/lib/posts/validation";

const HOME_JOB_COUNT = 5;
const HOME_LEASE_COUNT = 5;

export default async function Home() {
  const [jobResult, leaseResult] = await Promise.all([
    getJobPostList({ page: 1 }),
    getPostList({ page: 1, pageSize: HOME_LEASE_COUNT }),
  ]);

  const jobs = jobResult.items.slice(0, HOME_JOB_COUNT);

  return (
    <div className="bg-surface">
      <section className="border-b border-border bg-background">
        <Container className="flex flex-col items-start gap-4 py-12 sm:py-16">
          <h1 className="text-2xl font-bold sm:text-3xl">
            운송/화물차 정보 포털
          </h1>
          <p className="max-w-xl text-muted-foreground">
            구인·구직부터 운송 정보까지, 필요한 정보를 빠르게 찾을 수
            있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/jobs">
              <Button>구인공고 보기</Button>
            </Link>
            <Link href="/lease">
              <Button variant="outline">지입 구인/구직 보기</Button>
            </Link>
          </div>
        </Container>
      </section>

      <Container className="space-y-10 py-8">
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold">최신 구인공고</h2>
            <Link
              href="/jobs"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
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
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
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
