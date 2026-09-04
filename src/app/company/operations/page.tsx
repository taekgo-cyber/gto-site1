import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCompanyMemberships, requireUser } from "@/lib/auth/dal";
import { buildSafeReturnTo } from "@/lib/auth/redirect";
import { resolveActiveCompanyId } from "@/lib/company/context";
import { parseCompanyOperationsQuery } from "@/lib/leads/operations-validation";
import { listCompanyOperations } from "@/lib/leads/operations";
import { getDiscoverableLeadDetail } from "@/lib/leads/discovery";

export const metadata: Metadata = { title: "기업 운영 이력" };

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function toSearchParams(input: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

function href(params: URLSearchParams, updates: Record<string, string | null>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `/company/operations?${qs}` : "/company/operations";
}

export default async function CompanyOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const raw = searchParams ? await searchParams : {};
  // Documented query: parseCompanyOperationsQuery + leadId detail.
  const user = await requireUser(buildSafeReturnTo("/company/operations", raw, [
    "companyId", "page", "pageSize", "filter", "leadId",
  ]));
  const memberships = await getCompanyMemberships(user.id);
  const params = toSearchParams(raw);
  const query = parseCompanyOperationsQuery(params);

  let selectedCompanyId: string | null = null;
  let requireSelection = false;
  let contextError = false;
  try {
    const resolved = resolveActiveCompanyId({
      memberships,
      selectedCompanyId: query.companyId ?? null,
    });
    if (resolved.companyId) {
      selectedCompanyId = resolved.companyId;
    } else if ("requireSelection" in resolved && resolved.requireSelection) {
      requireSelection = true;
    }
  } catch {
    contextError = true;
  }

  if (contextError) {
    return (
      <Container className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>기업 운영 이력 접근 불가</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            현재 기업 권한 또는 기업 상태를 확인할 수 없습니다. 선택한 기업이 본인 소속이 맞는지 확인해 주세요.
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (requireSelection) {
    return (
      <Container className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>기업 선택 필요</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>활성화된 소속 기업이 2개 이상입니다. 운영 이력을 조회하려면 기업을 명시적으로 선택해야 합니다.</p>
            <form method="get" className="flex gap-2">
              <select
                name="companyId"
                aria-label="기업"
                defaultValue=""
                className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-base sm:text-sm"
              >
                <option value="">기업 선택</option>
                {memberships
                  .filter((m) => m.companyStatus === "ACTIVE" && m.status === "ACTIVE")
                  .map((m) => (
                    <option key={m.companyId} value={m.companyId}>
                      {m.companyName} ({m.role})
                    </option>
                  ))}
              </select>
              <Button type="submit" variant="outline" size="sm">
                선택
              </Button>
            </form>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (!selectedCompanyId) {
    return (
      <Container className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>기업 운영 이력</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            활성화된 기업 소속이 없어 운영 이력을 조회할 수 없습니다.
          </CardContent>
        </Card>
      </Container>
    );
  }

  // Every company-scoped query rechecks server-side actorUserId, selectedCompanyId, User ACTIVE, User.role COMPANY, Company ACTIVE, CompanyMember ACTIVE and role
  // listCompanyOperations internally does resolveActiveCompanyActor and canDiscoverLead check
  let ops: Awaited<ReturnType<typeof listCompanyOperations>> | null = null;
  let opsError: string | null = null;
  try {
    ops = await listCompanyOperations({
      actorUserId: user.id,
      companyId: selectedCompanyId,
      page: query.page,
      pageSize: query.pageSize,
      filter: query.filter,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "조회하지 못했습니다.";
    // Safe mapping — never expose Prisma/stack/env details
    if (raw.toLowerCase().includes("prisma") || raw.includes("DATABASE_URL") || raw.length > 200) {
      opsError = "조회 중 오류가 발생했습니다.";
    } else if (raw.startsWith("Forbidden") || raw.startsWith("Company") || raw.startsWith("ROLE_") || raw.startsWith("USER_") || raw.startsWith("MEMBER_")) {
      opsError = raw;
    } else {
      opsError = "조회 중 오류가 발생했습니다.";
    }
  }

  if (opsError || !ops) {
    return (
      <Container className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>기업 운영 이력 접근 불가</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{opsError ?? "권한을 확인할 수 없습니다."}</CardContent>
        </Card>
      </Container>
    );
  }

  // Detail re-entry: if leadId present, try to load discoverable detail (still privacy-safe)
  const leadIdParam = params.get("leadId");
  const detail = leadIdParam
    ? await getDiscoverableLeadDetail({ actorUserId: user.id, companyId: selectedCompanyId, leadId: leadIdParam }).catch(() => null)
    : null;

  return (
    <Container className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">기업 서비스</p>
          <h1 className="text-2xl font-bold">기업 운영 이력</h1>
          <p className="text-sm text-muted-foreground">선택한 기업 기준으로 매칭·열람 이력을 조회합니다. 과거 이력은 Lead가 PAUSED/CLOSED/EXPIRED여도 유지됩니다.</p>
        </div>
        <Link href="/mypage">
          <Button variant="ghost" size="sm">
            마이페이지
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기업 context</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-sm font-medium">
              현재 기업
              <select
                name="companyId"
                aria-label="현재 기업"
                defaultValue={selectedCompanyId}
                className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:text-sm"
              >
                {memberships
                  .filter((m) => m.companyStatus === "ACTIVE" && m.status === "ACTIVE")
                  .map((membership) => (
                    <option key={membership.companyId} value={membership.companyId}>
                      {membership.companyName} ({membership.role})
                    </option>
                  ))}
              </select>
            </label>
            <input type="hidden" name="filter" value={query.filter} />
            <input type="hidden" name="page" value={String(query.page)} />
            <Button type="submit" variant="outline" size="sm">
              기업 선택
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(["ALL", "ACTIVE", "CANCELLED", "UNLOCKED"] as const).map((f) => {
              const active = query.filter === f;
              return (
                <Link key={f} href={href(params, { filter: f, page: "1", leadId: null })}>
                  <Button variant={active ? "primary" : "outline"} size="sm">
                    {f}
                  </Button>
                </Link>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">UNLOCKED는 기존 LeadContactUnlock 존재 여부로 도출합니다. enum을 추가하지 않습니다.</p>
        </CardContent>
      </Card>

      {detail ? (
        <Card>
          <CardHeader>
            <CardTitle>상세 보기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">선택한 후보의 익명 요약입니다. 연락처는 별도 열람 경로를 통해서만 확인할 수 있습니다.</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">희망 지역</dt>
                <dd>{detail.preferredRegion?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">차종 / 톤수</dt>
                <dd>
                  {detail.vehicleType?.name ?? "-"} / {detail.tonnage?.name ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">경력</dt>
                <dd>{detail.experienceYears == null ? "-" : `${detail.experienceYears}년`}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lead 상태</dt>
                <dd>{detail.status}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">경력 요약</dt>
                <dd className="whitespace-pre-wrap">{detail.careerSummary ?? "-"}</dd>
              </div>
            </dl>
            <Link href={href(params, { leadId: null })}>
              <Button variant="ghost" size="sm">
                상세 닫기
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            운영 이력 {ops.totalCount}건
          </h2>
          <span className="text-sm text-muted-foreground">
            {ops.page} / {ops.totalPages} 페이지 (filter: {ops.filter})
          </span>
        </div>

        {ops.items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 이력이 없습니다.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ops.items.map((item) => (
              <Card key={`${item.leadId}:${item.matchCreatedAt.toISOString()}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">익명 후보</p>
                      <p className="text-sm text-muted-foreground">
                        {item.candidateSummary.preferredRegion?.name ?? "희망 지역 미정"} · {item.candidateSummary.vehicleType?.name ?? "차종 미정"} ·{" "}
                        {item.candidateSummary.tonnage?.name ?? "톤수 미정"}
                      </p>
                    </div>
                    <span className="rounded-full bg-surface px-2 py-1 text-xs">{item.matchStatus}</span>
                  </div>
                  <p className="text-sm">Lead 상태: {item.leadStatus}</p>
                  <p className="text-xs text-muted-foreground">매칭 시각: {item.matchCreatedAt.toISOString().slice(0, 19).replace("T", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    열람: {item.hasUnlock ? `있음 (${item.unlockedAt?.toISOString().slice(0, 19).replace("T", " ") ?? "-"})` : "없음"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    경력 {item.candidateSummary.experienceYears == null ? "미입력" : `${item.candidateSummary.experienceYears}년`} ·{" "}
                    {item.candidateSummary.desiredWorkType ?? "근무 형태 미정"}
                  </p>
                  <Link href={href(params, { leadId: item.leadId })}>
                    <Button variant="outline" size="sm">
                      상세 보기
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {ops.page > 1 ? (
            <Link href={href(params, { page: String(ops.page - 1), leadId: null })}>
              <Button variant="outline" size="sm">
                이전
              </Button>
            </Link>
          ) : null}
          {ops.page < ops.totalPages ? (
            <Link href={href(params, { page: String(ops.page + 1), leadId: null })}>
              <Button variant="outline" size="sm">
                다음
              </Button>
            </Link>
          ) : null}
        </div>
      </section>
    </Container>
  );
}
