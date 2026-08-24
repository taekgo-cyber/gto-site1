import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getAdvertisingMetrics } from "@/lib/analytics/ads";
import { getCurrentUser } from "@/lib/auth/dal";
import { getLeadMetrics } from "@/lib/leads/metrics";
import { validateMetricsDateRange } from "@/lib/leads/metrics-validation";

export const metadata: Metadata = { title: "리드 현황 - 관리자" };
export const dynamic = "force-dynamic";

type SearchParams = { from?: string; to?: string };

function formatMs(ms: number | null): string {
  if (ms == null) return "-";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  const seconds = Math.floor(ms / 1000);
  return `${seconds}초`;
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>관리자 권한 필요</CardTitle>
            <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button variant="outline" size="sm">
                로그인으로 이동
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Container>
    );
  }

  // Validate dates before calling service; invalid dates and from>to reject safely
  let dateError: string | null = null;
  try {
    validateMetricsDateRange({ from: params.from, to: params.to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "INVALID_DATE";
    if (msg.includes("INVALID_FROM")) dateError = "시작일(from)이 유효하지 않습니다.";
    else if (msg.includes("INVALID_TO")) dateError = "종료일(to)이 유효하지 않습니다.";
    else if (msg.includes("INVALID_DATE_RANGE")) dateError = "시작일이 종료일보다 늦을 수 없습니다.";
    else dateError = "날짜 형식이 올바르지 않습니다.";
  }

  if (dateError) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>리드 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {dateError}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">from/to는 ISO 8601 형식이며, [from,to) 구간으로 조회됩니다.</p>
            <div className="mt-4">
              <Link href="/admin/leads">
                <Button variant="outline" size="sm">
                  필터 초기화
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </Container>
    );
  }

  let metrics: Awaited<ReturnType<typeof getLeadMetrics>> | null = null;
  let adMetrics: Awaited<ReturnType<typeof getAdvertisingMetrics>> | null = null;
  let error: string | null = null;
  let isAdminRequired = false;

  try {
    // Session actor is authoritative; ignore any client adminUserId
    [metrics, adMetrics] = await Promise.all([
      getLeadMetrics({ actorUserId: user.id, from: params.from, to: params.to }),
      getAdvertisingMetrics({ actorUserId: user.id, from: params.from, to: params.to }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.";
    if (msg === "ADMIN_REQUIRED") {
      isAdminRequired = true;
      error = "관리자 권한이 필요합니다. (ACTIVE ADMIN만 접근 가능)";
    } else if (msg.includes("INVALID_FROM") || msg.includes("INVALID_TO") || msg.includes("INVALID_DATE")) {
      error = "날짜 형식이 올바르지 않습니다.";
    } else if (msg === "METRICS_DATE_RANGE_TOO_LARGE") {
      error = "광고 성과 통계는 한 번에 최대 90일까지 조회할 수 있습니다.";
    } else if (msg.toLowerCase().includes("prisma") || msg.includes("DATABASE_URL") || msg.includes("stack") || msg.length > 200) {
      error = "조회 중 오류가 발생했습니다.";
    } else {
      // Only show bounded safe messages; generic otherwise
      error = "조회 중 오류가 발생했습니다.";
    }
  }

  if (isAdminRequired) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>접근 불가</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (error || !metrics || !adMetrics) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>조회 오류</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error ?? "조회에 실패했습니다."}
            </p>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자</p>
          <h1 className="text-2xl font-bold">리드·광고 KPI</h1>
          <p className="text-sm text-muted-foreground">
            읽기 전용 집계 — Lead 퍼널 + 광고 노출·클릭·전환
          </p>
          {(params.from || params.to) && (
            <p className="mt-1 text-xs text-muted-foreground">
              기간: {metrics.leads.newFrom ?? params.from ?? "-"} ~ {metrics.leads.newTo ?? params.to ?? "-"} (신규 리드 {metrics.leads.newCount}건)
            </p>
          )}
        </div>
        <Link href="/admin/companies">
          <Button variant="ghost" size="sm">
            업체 승인
          </Button>
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs text-muted-foreground">
            from (포함)
          </label>
          <input
            id="from"
            name="from"
            type="datetime-local"
            defaultValue={params.from ?? ""}
            className="h-11 rounded-md border border-border px-3 text-base sm:text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs text-muted-foreground">
            to (미포함)
          </label>
          <input id="to" name="to" type="datetime-local" defaultValue={params.to ?? ""} className="h-11 rounded-md border border-border px-3 text-base sm:text-sm" />
        </div>
        <Button type="submit" variant="outline" size="sm">
          조회
        </Button>
        <Link href="/admin/leads">
          <Button variant="ghost" size="sm" type="button">
            초기화
          </Button>
        </Link>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>리드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              전체: <span className="font-semibold">{metrics.leads.total}</span>
            </p>
            <p>
              ACTIVE: <span className="font-semibold">{metrics.leads.active}</span>
            </p>
            <p>
              신규(기간 내): <span className="font-semibold">{metrics.leads.newCount}</span>
              <span className="ml-1 text-xs text-muted-foreground">[from,to)</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>매칭</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              전체: <span className="font-semibold">{metrics.matches.total}</span>
            </p>
            <p>
              ACTIVE: <span className="font-semibold">{metrics.matches.active}</span> / CANCELLED:{" "}
              <span className="font-semibold">{metrics.matches.cancelled}</span>
            </p>
            <p>
              평균/리드: <span className="font-semibold">{metrics.matches.avgPerLead.toFixed(2)}</span>
              <span className="ml-1 text-xs text-muted-foreground">(분모: {metrics.matches.avgPerLeadDenominator} 리드)</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>언락</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              전체: <span className="font-semibold">{metrics.unlocks.total}</span>
            </p>
            <p>
              평균/리드: <span className="font-semibold">{metrics.unlocks.avgPerLead.toFixed(2)}</span>
              <span className="ml-1 text-xs text-muted-foreground">(분모: {metrics.unlocks.avgPerLeadDenominator} 리드)</span>
            </p>
            <p>
              매칭→언락 전환: <span className="font-semibold">{(metrics.conversion.rate * 100).toFixed(1)}%</span>
              <span className="ml-1 text-xs text-muted-foreground">
                ({metrics.conversion.uniqueUnlockedMatchedPairs}/{metrics.conversion.uniqueMatchedPairs})
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>소요 시간</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              첫 매칭까지 평균: <span className="font-semibold">{formatMs(metrics.timing.avgFirstMatchMs)}</span>
              <span className="ml-1 text-xs text-muted-foreground">(표본 {metrics.timing.avgFirstMatchSampleCount}건)</span>
            </p>
            <p>
              첫 언락까지 평균: <span className="font-semibold">{formatMs(metrics.timing.avgFirstUnlockMs)}</span>
              <span className="ml-1 text-xs text-muted-foreground">(표본 {metrics.timing.avgFirstUnlockSampleCount}건)</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>업체별</CardTitle>
          <p className="text-xs text-muted-foreground">회사명 / 매칭 / 언락 / 전환 (companyId+leadId 기준)</p>
        </CardHeader>
        <CardContent>
          {metrics.perCompany.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">집계된 업체가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">업체명</th>
                    <th className="px-2 py-2 font-medium">매칭</th>
                    <th className="px-2 py-2 font-medium">언락</th>
                    <th className="px-2 py-2 font-medium">전환</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.perCompany.map((row) => (
                    <tr key={row.companyId} className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">{row.companyName}</td>
                      <td className="px-2 py-2">{row.matchCount}</td>
                      <td className="px-2 py-2">{row.unlockCount}</td>
                      <td className="px-2 py-2">{(row.conversionRate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2 border-t border-border pt-6">
        <h2 className="text-xl font-bold">광고 성과</h2>
        <p className="text-xs text-muted-foreground">
          집계 기간: {adMetrics.from} ~ {adMetrics.to} · 기본 조회는 최근 30일, 최대 90일입니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>노출</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{adMetrics.totals.impressions.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>클릭 / CTR</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{adMetrics.totals.clicks.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {(adMetrics.totals.ctr * 100).toFixed(2)}% ({adMetrics.totals.clicks}/{adMetrics.totals.impressions})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lead 전환</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{adMetrics.totals.conversions.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>클릭→Lead</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{(adMetrics.totals.clickConversionRate * 100).toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">
              ({adMetrics.totals.conversions}/{adMetrics.totals.clicks})
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>캠페인별 광고 KPI</CardTitle>
          <p className="text-xs text-muted-foreground">노출 → 클릭(CTR) → Lead 활성화 전환</p>
        </CardHeader>
        <CardContent>
          {adMetrics.perCampaign.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">집계된 광고 이벤트가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2">캠페인</th><th className="px-2 py-2">광고주</th><th className="px-2 py-2">위치</th><th className="px-2 py-2">노출</th><th className="px-2 py-2">클릭</th><th className="px-2 py-2">CTR</th><th className="px-2 py-2">전환</th><th className="px-2 py-2">클릭→Lead</th></tr></thead>
                <tbody>
                  {adMetrics.perCampaign.map((row) => (
                    <tr key={row.campaignId} className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">{row.title}</td><td className="px-2 py-2">{row.companyName}</td><td className="px-2 py-2">{row.placementName}</td><td className="px-2 py-2">{row.impressions}</td><td className="px-2 py-2">{row.clicks}</td><td className="px-2 py-2">{(row.ctr * 100).toFixed(2)}%</td><td className="px-2 py-2">{row.conversions}</td><td className="px-2 py-2">{(row.clickConversionRate * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>광고주별 KPI</CardTitle></CardHeader>
          <CardContent>
            {adMetrics.perCompany.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">집계된 광고주가 없습니다.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2">광고주</th><th className="px-2 py-2">노출</th><th className="px-2 py-2">클릭</th><th className="px-2 py-2">CTR</th><th className="px-2 py-2">전환</th><th className="px-2 py-2">클릭→Lead</th></tr></thead><tbody>{adMetrics.perCompany.map((row) => <tr key={row.companyId} className="border-b last:border-0"><td className="px-2 py-2 font-medium">{row.companyName}</td><td className="px-2 py-2">{row.impressions}</td><td className="px-2 py-2">{row.clicks}</td><td className="px-2 py-2">{(row.ctr * 100).toFixed(2)}%</td><td className="px-2 py-2">{row.conversions}</td><td className="px-2 py-2">{(row.clickConversionRate * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>노출 위치별 KPI</CardTitle></CardHeader>
          <CardContent>
            {adMetrics.perPlacement.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">집계된 광고 위치가 없습니다.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2">위치</th><th className="px-2 py-2">노출</th><th className="px-2 py-2">클릭</th><th className="px-2 py-2">CTR</th><th className="px-2 py-2">전환</th><th className="px-2 py-2">클릭→Lead</th></tr></thead><tbody>{adMetrics.perPlacement.map((row) => <tr key={row.placementId} className="border-b last:border-0"><td className="px-2 py-2 font-medium">{row.placementName}</td><td className="px-2 py-2">{row.impressions}</td><td className="px-2 py-2">{row.clicks}</td><td className="px-2 py-2">{(row.ctr * 100).toFixed(2)}%</td><td className="px-2 py-2">{row.conversions}</td><td className="px-2 py-2">{(row.clickConversionRate * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">Lead 집계와 광고 이벤트 집계는 PII(이름/전화/이메일), raw IP, raw User-Agent를 광고 분석 데이터에 저장하지 않습니다.</p>
    </Container>
  );
}
