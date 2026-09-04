import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCompanyMemberships, requireUser } from "@/lib/auth/dal";
import { buildSafeReturnTo } from "@/lib/auth/redirect";
import { prisma } from "@/lib/prisma";
import { getLeadMatch, getLeadUnlock } from "@/lib/leads/dal";
import { canMatchOrUnlock, resolveActiveCompanyActor } from "@/lib/leads/authorization";
import { resolveActiveCompanyId } from "@/lib/company/context";
import { discoverCandidateLeads, getDiscoverableLeadDetail } from "@/lib/leads/discovery";
import { parseLeadDiscoveryQuery } from "@/lib/leads/discovery-validation";
import { cancelCompanyLeadMatch, createCompanyLeadMatch } from "@/lib/leads/company-actions";
import { unlockCompanyLeadContact } from "@/lib/leads/unlock-actions";
import { readUnlockedLeadContact } from "@/lib/leads/service";

export const metadata: Metadata = { title: "인재찾기" };

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
  return `/company/leads?${next.toString()}`;
}

export default async function CompanyLeadDiscoveryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const raw = searchParams ? await searchParams : {};
  // Documented query: parseLeadDiscoveryQuery + leadId detail. Transient unlockError is dropped.
  const user = await requireUser(buildSafeReturnTo("/company/leads", raw, [
    "companyId", "page", "pageSize", "leadId",
    "preferredRegionId", "vehicleTypeId", "tonnageId", "desiredWorkType",
    "minExperienceYears", "leaseExperience", "vehicleOwned", "availableFromBefore",
  ]));
  const memberships = await getCompanyMemberships(user.id);
  const params = toSearchParams(raw);
  const query = parseLeadDiscoveryQuery(params);
  let selectedCompanyId: string | null = null;
  let resolveRequireSelection = false;
  let resolveError = false;
  try {
    const resolved = resolveActiveCompanyId({
      memberships,
      selectedCompanyId: query.companyId ?? null,
    });
    if (resolved.companyId) {
      selectedCompanyId = resolved.companyId;
    } else if ("requireSelection" in resolved && resolved.requireSelection) {
      resolveRequireSelection = true;
    }
  } catch {
    resolveError = true;
  }

  if (resolveError) {
    return (
      <Container className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>인재찾기 접근 불가</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">현재 기업 권한 또는 기업 상태를 확인할 수 없습니다.</CardContent>
        </Card>
      </Container>
    );
  }

  if (resolveRequireSelection) {
    return (
      <Container className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>기업 선택 필요</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            활성화된 소속 기업이 2개 이상입니다. 인재찾기를 이용하려면 기업을 명시적으로 선택해야 합니다.
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (!selectedCompanyId) {
    return <Container className="mx-auto max-w-2xl py-8"><Card><CardHeader><CardTitle>인재찾기</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">활성화된 기업 소속이 없어 인재찾기를 이용할 수 없습니다.</CardContent></Card></Container>;
  }

  const companyAuth = await resolveActiveCompanyActor(user.id, selectedCompanyId);
  if (!companyAuth.ok) {
    return <Container className="mx-auto max-w-2xl py-8"><Card><CardHeader><CardTitle>인재찾기 접근 불가</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">현재 기업 권한 또는 기업 상태를 확인할 수 없습니다.</CardContent></Card></Container>;
  }

  const [regions, vehicleTypes, tonnages] = await Promise.all([
    prisma.region.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicleType.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tonnage.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const result = await discoverCandidateLeads({ actorUserId: user.id, companyId: selectedCompanyId, page: query.page, pageSize: query.pageSize, filters: query.filters });
  const detail = params.get("leadId") ? await getDiscoverableLeadDetail({ actorUserId: user.id, companyId: selectedCompanyId, leadId: params.get("leadId")! }).catch(() => null) : null;
  const detailMatch = detail ? await getLeadMatch(selectedCompanyId, detail.id) : null;
  const detailUnlock = detail ? await getLeadUnlock(selectedCompanyId, detail.id) : null;
  const unlockedContact = detailUnlock && detailMatch?.status === "ACTIVE"
    ? await readUnlockedLeadContact({ actorUserId: user.id, companyId: selectedCompanyId, leadId: detail?.id ?? "" }).then((result) => result.contact).catch(() => null)
    : null;
  const canMatch = canMatchOrUnlock(companyAuth.actor);
  const unlockError = params.get("unlockError") === "1";

  return (
    <Container className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">기업 서비스</p><h1 className="text-2xl font-bold">인재찾기</h1></div>
        <Link href="/mypage"><Button variant="ghost" size="sm">마이페이지</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>기업 context</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-sm font-medium">현재 기업
              <select name="companyId" aria-label="현재 기업" defaultValue={selectedCompanyId} className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:text-sm">
                {memberships.map((membership) => <option key={membership.companyId} value={membership.companyId}>{membership.companyName} ({membership.role})</option>)}
              </select>
            </label>
            <Button type="submit" variant="outline" size="sm">기업 선택</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>조건으로 찾기</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="companyId" value={selectedCompanyId} />
            <select name="preferredRegionId" aria-label="희망 지역" defaultValue={query.filters.preferredRegionId ?? ""} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm"><option value="">희망 지역 전체</option>{regions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            <select name="vehicleTypeId" aria-label="희망 차종" defaultValue={query.filters.vehicleTypeId ?? ""} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm"><option value="">차종 전체</option>{vehicleTypes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            <select name="tonnageId" aria-label="희망 톤수" defaultValue={query.filters.tonnageId ?? ""} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm"><option value="">톤수 전체</option>{tonnages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            <select name="desiredWorkType" aria-label="희망 근무 형태" defaultValue={query.filters.desiredWorkType ?? ""} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm"><option value="">근무 형태 전체</option><option value="FULL_TIME">전일제</option><option value="PART_TIME">파트타임</option><option value="CONTRACT">계약직</option><option value="DAILY">일용직</option><option value="FREELANCE">프리랜서</option></select>
            <input name="minExperienceYears" aria-label="최소 경력(년)" type="number" min="0" placeholder="최소 경력(년)" defaultValue={query.filters.minExperienceYears ?? ""} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm" />
            <select name="leaseExperience" aria-label="지입 경험" defaultValue={query.filters.leaseExperience == null ? "" : String(query.filters.leaseExperience)} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm"><option value="">지입 경험 전체</option><option value="true">있음</option><option value="false">없음</option></select>
            <select name="vehicleOwned" aria-label="차량 보유" defaultValue={query.filters.vehicleOwned == null ? "" : String(query.filters.vehicleOwned)} className="h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm"><option value="">차량 보유 전체</option><option value="true">보유</option><option value="false">미보유</option></select>
            <Button type="submit" size="sm">검색</Button>
          </form>
        </CardContent>
      </Card>

      {detail ? (
        <Card>
          <CardHeader><CardTitle>익명 구직자 상세</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {unlockError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">현재 권한, 매칭 상태 또는 unlock 정책을 확인할 수 없어 연락처를 열람하지 못했습니다.</p> : null}
            <dl className="grid gap-2 sm:grid-cols-2">
              <div><dt className="text-muted-foreground">희망 지역</dt><dd>{detail.preferredRegion?.name ?? "-"}</dd></div>
              <div><dt className="text-muted-foreground">차종 / 톤수</dt><dd>{detail.vehicleType?.name ?? "-"} / {detail.tonnage?.name ?? "-"}</dd></div>
              <div><dt className="text-muted-foreground">경력</dt><dd>{detail.experienceYears == null ? "-" : `${detail.experienceYears}년`}</dd></div>
              <div><dt className="text-muted-foreground">희망 근무 형태</dt><dd>{detail.desiredWorkType ?? "-"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">경력 요약</dt><dd className="whitespace-pre-wrap">{detail.careerSummary ?? "-"}</dd></div>
            </dl>
            {unlockedContact ? <div className="rounded-md border border-green-200 bg-green-50 p-3"><p className="text-sm font-medium text-green-800">연락처 열람 가능</p><p className="mt-1 text-sm">{unlockedContact.name}</p><a href={`tel:${unlockedContact.phone ?? ""}`} className="inline-flex min-h-11 items-center text-sm text-primary">{unlockedContact.phone ?? "전화번호 미등록"}</a></div> : <p className="text-xs text-muted-foreground">연락처는 매칭 후 무료 MVP unlock을 통해서만 확인할 수 있습니다.</p>}
            {canMatch ? (
              detailMatch?.status === "ACTIVE" ? (
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-green-700">매칭 관심 등록됨</span>{unlockedContact ? null : <form action={unlockCompanyLeadContact}><input type="hidden" name="companyId" value={selectedCompanyId} /><input type="hidden" name="leadId" value={detail.id} /><Button type="submit">무료로 연락처 보기</Button></form>}<form action={cancelCompanyLeadMatch}><input type="hidden" name="companyId" value={selectedCompanyId} /><input type="hidden" name="leadId" value={detail.id} /><Button type="submit" variant="ghost" size="sm" className="text-red-600">관심 취소</Button></form></div>
              ) : (
                <form action={createCompanyLeadMatch}><input type="hidden" name="companyId" value={selectedCompanyId} /><input type="hidden" name="leadId" value={detail.id} /><Button type="submit">관심 매칭 등록</Button></form>
              )
            ) : <p className="text-sm text-muted-foreground">현재 권한은 인재 탐색만 가능하며 매칭 등록은 OWNER/MANAGER만 할 수 있습니다.</p>}
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">구직 후보 {result.totalCount}명</h2><span className="text-sm text-muted-foreground">{result.page} / {result.totalPages} 페이지</span></div>
        {result.items.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">현재 조건에 맞는 구직 후보가 없습니다.</CardContent></Card> : <div className="grid gap-3 md:grid-cols-2">{result.items.map((item) => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">익명 구직 후보</p><p className="text-sm text-muted-foreground">{item.preferredRegion?.name ?? "희망 지역 미정"} · {item.vehicleType?.name ?? "차종 미정"} · {item.tonnage?.name ?? "톤수 미정"}</p></div><span className="rounded-full bg-surface px-2 py-1 text-xs">ACTIVE</span></div><p className="text-sm">경력 {item.experienceYears == null ? "미입력" : `${item.experienceYears}년`} · {item.desiredWorkType ?? "근무 형태 미정"}</p><Link href={href(params, { leadId: item.id, page: null })}><Button variant="outline" size="sm">상세 보기</Button></Link></CardContent></Card>)}</div>}
        <div className="flex gap-2">{result.page > 1 ? <Link href={href(params, { page: String(result.page - 1), leadId: null })}><Button variant="outline" size="sm">이전</Button></Link> : null}{result.page < result.totalPages ? <Link href={href(params, { page: String(result.page + 1), leadId: null })}><Button variant="outline" size="sm">다음</Button></Link> : null}</div>
      </section>
    </Container>
  );
}
