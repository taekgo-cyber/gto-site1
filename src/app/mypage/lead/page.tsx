import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CandidateLeadForm, type CandidateLeadFormValue } from "@/components/leads/CandidateLeadForm";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getActiveLeadForUser, getLatestLeadForUser } from "@/lib/leads/dal";
import { listCandidateOperations } from "@/lib/leads/operations";
import { parseCandidateOperationsQuery } from "@/lib/leads/operations-validation";

export const metadata: Metadata = { title: "내 구직정보" };

export const dynamic = "force-dynamic";

function dateValue(value: Date | null) {
  return value?.toISOString() ?? null;
}

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
  return qs ? `/mypage/lead?${qs}` : "/mypage/lead";
}

export default async function CandidateLeadPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser();
  const raw = searchParams ? await searchParams : {};
  const params = toSearchParams(raw);
  const query = parseCandidateOperationsQuery(params);
  const activeLead = await getActiveLeadForUser(user.id);
  const latestLead = activeLead ?? await getLatestLeadForUser(user.id);
  const [regions, vehicleTypes, tonnages, operations] = await Promise.all([
    prisma.region.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicleType.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tonnage.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listCandidateOperations({ actorUserId: user.id, page: query.page, pageSize: query.pageSize }).catch(() => ({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      totalCount: 0,
      totalPages: 1,
    })),
  ]);

  const lead: CandidateLeadFormValue | null = latestLead
    ? {
        id: latestLead.id,
        status: latestLead.status,
        preferredRegionId: latestLead.preferredRegionId,
        vehicleTypeId: latestLead.vehicleTypeId,
        tonnageId: latestLead.tonnageId,
        experienceYears: latestLead.experienceYears,
        leaseExperience: latestLead.leaseExperience,
        vehicleOwned: latestLead.vehicleOwned,
        licenseInfo: latestLead.licenseInfo,
        desiredWorkType: latestLead.desiredWorkType,
        desiredIncomeMin: latestLead.desiredIncomeMin,
        desiredIncomeMax: latestLead.desiredIncomeMax,
        availableFrom: dateValue(latestLead.availableFrom),
        careerSummary: latestLead.careerSummary,
        expiresAt: dateValue(latestLead.expiresAt),
      }
    : null;
  const terminal = lead?.status === "CLOSED" || lead?.status === "EXPIRED";

  return (
    <Container className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">마이페이지</p>
          <h1 className="text-2xl font-bold">내 구직정보</h1>
        </div>
        <Link href="/mypage"><Button variant="ghost" size="sm">마이페이지로</Button></Link>
      </div>

      {terminal ? (
        <Card>
          <CardHeader><CardTitle>{lead.status === "CLOSED" ? "종료된 구직정보" : "만료된 구직정보"}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>종료되거나 만료된 구직정보는 다시 공개할 수 없습니다.</p>
            <p>새로운 구직 활동을 시작하려면 아래에서 새 구직정보를 작성해 주세요.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{lead && !terminal ? "구직정보 수정" : "구직정보 등록"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            임시 저장 후 내용을 확인하고 공개할 수 있습니다. 회원 프로필의 연락처는 Lead에 복사 저장하지 않습니다.
          </p>
        </CardHeader>
        <CardContent>
          <CandidateLeadForm
            lead={terminal ? null : lead}
            regions={regions}
            vehicleTypes={vehicleTypes}
            tonnages={tonnages}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기업 매칭 이력</CardTitle>
          <p className="text-sm text-muted-foreground">
            내 구직정보에 관심을 보인 기업의 매칭 상태와 열람 여부를 확인할 수 있습니다. 연락처는 기업이 열람한 경우에도 이 목록에서 노출하지 않습니다.
          </p>
        </CardHeader>
        <CardContent>
          {operations.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 매칭 이력이 없습니다.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {operations.items.map((item) => (
                  <li
                    key={`${item.companyId}:${item.leadId}:${item.matchCreatedAt.toISOString()}`}
                    className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{item.companyName}</span>
                      <span className="text-xs text-muted-foreground">Lead 상태: {item.leadStatus}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>매칭: {item.matchStatus}</span>
                      <span>매칭 시각: {item.matchCreatedAt.toISOString().slice(0, 19).replace("T", " ")}</span>
                      <span>열람: {item.hasUnlock ? `있음 (${item.unlockedAt?.toISOString().slice(0, 19).replace("T", " ") ?? "-"})` : "없음"}</span>
                    </div>
                    <Link href="/mypage/lead" className="text-xs text-primary underline">
                      내 구직정보 보기
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {operations.page} / {operations.totalPages} 페이지 (총 {operations.totalCount}건)
                </span>
                <div className="flex gap-2">
                  {operations.page > 1 ? (
                    <Link href={href(params, { page: String(operations.page - 1), pageSize: String(operations.pageSize) })}>
                      <Button variant="outline" size="sm">이전</Button>
                    </Link>
                  ) : null}
                  {operations.page < operations.totalPages ? (
                    <Link href={href(params, { page: String(operations.page + 1), pageSize: String(operations.pageSize) })}>
                      <Button variant="outline" size="sm">다음</Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
