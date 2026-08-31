import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Pagination } from "@/components/jobs/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  SEARCH_DOMAINS,
  type SearchDomain,
  type UnifiedSearchPage,
  type UnifiedSearchRequest,
} from "@/lib/search/contract";
import { logOperationalError } from "@/lib/observability/logger";
import { searchPublicContent } from "@/lib/search/dal";
import {
  isSearchRequestValidationError,
  parseUnifiedSearchRequest,
  type SearchParams,
} from "@/lib/search/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "통합검색",
  description: "공개된 구인공고, 지입 게시글, 업체와 블로그 정보를 한 번에 찾습니다.",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

const DOMAIN_LABELS: Record<SearchDomain, string> = {
  JOBS: "구인공고",
  LEASE: "지입",
  COMPANIES: "업체정보",
  BLOG: "블로그",
};

const MATCH_LABELS: Record<UnifiedSearchPage["items"][number]["matchedOn"], string> = {
  TITLE_EXACT: "제목 일치",
  TITLE_PREFIX: "제목 시작",
  TITLE_CONTAINS: "제목 포함",
  BODY_CONTAINS: "본문 포함",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function searchValidationMessage(error: unknown): string {
  if (!(error instanceof Error)) return "검색 조건을 확인해 주세요.";
  if (error.message === "SEARCH_QUERY_REQUIRED") return "검색어를 입력해 주세요.";
  if (error.message === "SEARCH_QUERY_INVALID") return "검색어는 2자 이상 100자 이하로 입력해 주세요.";
  if (error.message === "SEARCH_DOMAINS_INVALID") return "검색 범위를 다시 선택해 주세요.";
  if (error.message === "SEARCH_PAGE_INVALID") return "조회할 수 없는 페이지입니다.";
  if (error.message.endsWith("_REPEATED")) return "검색 조건을 한 번씩만 입력해 주세요.";
  return "검색 조건을 확인해 주세요.";
}

function selectedDomainValue(request: UnifiedSearchRequest | null): string {
  if (!request || request.domains.length === SEARCH_DOMAINS.length) return "";
  return request.domains.join(",");
}

function searchSystemCategory(error: unknown): "DATABASE" | "UNEXPECTED" {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && code.startsWith("P")) return "DATABASE";
  if (error instanceof Error && /prisma/i.test(error.name)) return "DATABASE";
  return "UNEXPECTED";
}

export default async function SearchPage(props: PageProps<"/search">) {
  const rawParams = await props.searchParams;
  const hasQuery = rawParams.q !== undefined;
  let request: UnifiedSearchRequest | null = null;
  let result: UnifiedSearchPage | null = null;
  let validationErrorMessage: string | null = null;
  let systemErrorMessage: string | null = null;

  if (hasQuery) {
    try {
      request = parseUnifiedSearchRequest(rawParams as SearchParams);
    } catch (error) {
      if (isSearchRequestValidationError(error)) {
        validationErrorMessage = searchValidationMessage(error);
      } else {
        systemErrorMessage = "일시적인 오류로 검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        logOperationalError({
          operation: "search_public_content",
          actorType: "ANONYMOUS",
          category: searchSystemCategory(error),
          error,
          identifiers: { route: "/search" },
        });
      }
    }

    if (request) {
      try {
        result = await searchPublicContent(request);
      } catch (error) {
        systemErrorMessage = "일시적인 오류로 검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        logOperationalError({
          operation: "search_public_content",
          actorType: "ANONYMOUS",
          category: searchSystemCategory(error),
          error,
          identifiers: { route: "/search" },
        });
      }
    }
  }

  const rawQuery = typeof rawParams.q === "string" ? rawParams.q : "";
  const totalLabel = result?.candidateLimited
    ? `상위 후보에서 ${result.totalMatches}건`
    : `${result?.totalMatches ?? 0}건`;

  return (
    <Container className="space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">통합검색</h1>
        <p className="text-sm text-muted-foreground">
          공개된 구인공고, 지입 게시글, 업체와 블로그 정보를 한 번에 검색합니다.
        </p>
      </header>

      <form
        action="/search"
        method="get"
        role="search"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
      >
        <div>
          <label htmlFor="search-query" className="sr-only">검색어</label>
          <Input
            id="search-query"
            name="q"
            type="search"
            minLength={2}
            maxLength={100}
            defaultValue={request?.query ?? rawQuery}
            placeholder="예: 5톤 지입, 화물 운송"
            required
          />
        </div>
        <div>
          <label htmlFor="search-domains" className="sr-only">검색 범위</label>
          <Select
            id="search-domains"
            name="domains"
            defaultValue={selectedDomainValue(request)}
          >
            <option value="">전체</option>
            <option value="JOBS">구인공고</option>
            <option value="LEASE">지입</option>
            <option value="COMPANIES">업체정보</option>
            <option value="BLOG">블로그</option>
            <option value="JOBS,LEASE">구인공고 + 지입</option>
            <option value="JOBS,BLOG">구인공고 + 블로그</option>
            <option value="LEASE,BLOG">지입 + 블로그</option>
          </Select>
        </div>
        <Button type="submit">검색</Button>
      </form>

      {!hasQuery ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            두 글자 이상의 검색어를 입력하면 공개 콘텐츠를 한 번에 찾을 수 있습니다.
          </CardContent>
        </Card>
      ) : null}

      {validationErrorMessage ? (
        <Card role="alert">
          <CardContent className="py-8 text-center text-sm text-red-700">
            {validationErrorMessage}
          </CardContent>
        </Card>
      ) : null}

      {systemErrorMessage ? (
        <Card role="alert">
          <CardContent className="space-y-2 py-8 text-center">
            <p className="text-sm font-medium text-red-700">{systemErrorMessage}</p>
            <p className="text-xs text-muted-foreground">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </CardContent>
        </Card>
      ) : null}

      {request && result ? (
        <section aria-labelledby="search-results-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="search-results-heading" className="text-xl font-bold">
                “{result.query}” 검색 결과
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{totalLabel}</p>
            </div>
            <p className="text-xs text-muted-foreground">최신 공개 정보 기준</p>
          </div>

          {result.candidateLimited ? (
            <p className="rounded-md bg-surface p-3 text-sm text-muted-foreground">
              검색 부하를 보호하기 위해 도메인별 최신 후보만 표시합니다. 더 구체적인 검색어를 사용해 주세요.
            </p>
          ) : null}

          {result.totalMatches === 0 ? (
            <Card>
              <CardContent className="space-y-2 py-12 text-center">
                <p className="font-medium">조건에 맞는 공개 정보가 없습니다.</p>
                <p className="text-sm text-muted-foreground">
                  검색어를 줄이거나 검색 범위를 전체로 바꿔 보세요.
                </p>
              </CardContent>
            </Card>
          ) : result.items.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 py-12 text-center">
                <p className="font-medium">요청한 페이지에는 표시할 결과가 없습니다.</p>
                <p className="text-sm text-muted-foreground">
                  마지막 결과 페이지로 이동해 다른 결과를 확인해 보세요.
                </p>
                {result.totalPages >= 1 ? (
                  <Link
                    href={
                      (() => {
                        const params = new URLSearchParams();
                        params.set("q", result.query);
                        if (result.domains.length !== SEARCH_DOMAINS.length) {
                          params.set("domains", result.domains.join(","));
                        }
                        if (result.totalPages > 1) params.set("page", String(result.totalPages));
                        const qs = params.toString();
                        return qs ? `/search?${qs}` : "/search";
                      })()
                    }
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    마지막 페이지로 이동
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {result.items.map((item) => (
                <li key={`${item.domain}:${item.id}`}>
                  <Link href={item.href} className="block">
                    <Card className="transition-colors hover:bg-surface/60">
                      <CardHeader className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="primary">{DOMAIN_LABELS[item.domain]}</Badge>
                          <Badge variant="outline">{MATCH_LABELS[item.matchedOn]}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
                        </div>
                        <CardTitle className="text-lg sm:text-xl">{item.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {item.excerpt ? (
                          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{item.excerpt}</p>
                        ) : null}
                        {item.context ? <p className="text-xs text-muted-foreground">{item.context}</p> : null}
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Pagination
            currentPage={result.page}
            totalPages={result.totalPages}
            basePath="/search"
            query={{
              q: result.query,
              domains: result.domains.length === SEARCH_DOMAINS.length
                ? undefined
                : result.domains.join(","),
            }}
          />
        </section>
      ) : null}
    </Container>
  );
}
