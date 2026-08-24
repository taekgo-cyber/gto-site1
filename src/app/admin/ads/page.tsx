import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/dal";
import { getAdminAdvertisementOperations } from "@/lib/monetization/ads";
import {
  cancelAdvertisementEntitlementAction,
  setAdvertisementProductStatusAction,
} from "./actions";
import {
  expireAdvertisementCampaignsAction,
  grantAdvertisementEntitlementAction,
  setAdvertisementCampaignStatusAction,
  syncAdvertisementCatalogAction,
  upsertAdvertisementPlacementAction,
} from "./actions";

export const metadata: Metadata = { title: "광고 운영 - 관리자" };
export const dynamic = "force-dynamic";

type SearchParams = { message?: string; error?: string };

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

const inputClass = "h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm";

export default async function AdminAdsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await requireRole("ADMIN");
  const data = await getAdminAdvertisementOperations(user.id);

  return (
    <Container className="space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">광고 운영</h1>
        <p className="mt-1 text-sm text-muted-foreground">상품 정책, 노출 위치, 업체 권한, 캠페인 승인을 관리합니다.</p>
      </div>

      {params.message ? <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{params.message}</p> : null}
      {params.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p> : null}

      <Card>
        <CardHeader><CardTitle>광고상품 정책</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form action={syncAdvertisementCatalogAction}>
            <Button type="submit">잠긴 상품 정책 동기화</Button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="p-2">코드</th><th className="p-2">상품</th><th className="p-2">가격</th><th className="p-2">등급/주간 Match</th><th className="p-2">상태</th><th className="p-2">관리</th></tr></thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.id} className="border-b border-border/60">
                    <td className="p-2 font-mono text-xs">{product.code ?? "legacy"}</td>
                    <td className="p-2">{product.name}</td>
                    <td className="p-2">{product.price.toLocaleString()}원</td>
                    <td className="p-2">{product.recruitmentEntitlement ? `${product.recruitmentEntitlement.recruitmentTier} / ${product.recruitmentEntitlement.weeklyMatchQuota}` : "-"}</td>
                    <td className="p-2">{product.status}</td>
                    <td className="p-2">
                      {product.code ? (
                        <form action={setAdvertisementProductStatusAction}>
                          <input type="hidden" name="productCode" value={product.code} />
                          <input type="hidden" name="status" value={product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                          <Button type="submit" variant="outline" size="sm">
                            {product.status === "ACTIVE" ? "일시중지" : "활성화"}
                          </Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>광고 위치</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form action={upsertAdvertisementPlacementAction} className="grid gap-3 md:grid-cols-4">
            <input name="code" aria-label="광고 위치 코드" required placeholder="HOME_TOP" className={inputClass} />
            <input name="name" aria-label="광고 위치 이름" required placeholder="홈 상단" className={inputClass} />
            <input name="description" aria-label="광고 위치 설명" placeholder="설명(선택)" className={inputClass} />
            <select name="isActive" aria-label="광고 위치 상태" defaultValue="true" className={inputClass}><option value="true">활성</option><option value="false">비활성</option></select>
            <div className="md:col-span-4"><Button type="submit" variant="outline">위치 저장</Button></div>
          </form>
          <ul className="grid gap-2 md:grid-cols-2">
            {data.placements.map((placement) => (
              <li key={placement.id} className="rounded-md border border-border p-3 text-sm">
                <strong>{placement.code}</strong> · {placement.name} · {placement.isActive ? "ACTIVE" : "INACTIVE"}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>광고주 상품 계약 부여</CardTitle></CardHeader>
        <CardContent>
          <form action={grantAdvertisementEntitlementAction} className="grid gap-3 md:grid-cols-2">
            <select name="companyId" aria-label="광고주 업체" required defaultValue="" className={inputClass}>
              <option value="" disabled>업체 선택</option>
              {data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select name="productCode" aria-label="광고상품" required defaultValue="" className={inputClass}>
              <option value="" disabled>상품 선택</option>
              {data.products.filter((p) => p.code && p.status === "ACTIVE").map((product) => <option key={product.id} value={product.code!}>{product.name}</option>)}
            </select>
            <input name="sourceReference" aria-label="권한 부여 근거" required placeholder="예: manual:company:20260824" className={inputClass} />
            <input name="idempotencyKey" aria-label="고유 처리키" required placeholder="고유 처리키" className={inputClass} />
            <div className="md:col-span-2"><Button type="submit">7일 권한 부여</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>광고주 계약 이력</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.entitlements.length === 0 ? <p className="text-sm text-muted-foreground">부여된 권한이 없습니다.</p> : data.entitlements.map((entitlement) => (
            <div key={entitlement.id} className="space-y-2 rounded-md border border-border p-3 text-sm">
              <div>
                <strong>{entitlement.company.name}</strong> · {entitlement.productEntitlement?.product.code ?? entitlement.recruitmentTier} · {formatDate(entitlement.validFrom)} ~ {formatDate(entitlement.expiresAt)} · {entitlement.cancelledAt ? "CANCELLED" : "GRANTED"} · {entitlement.source}
              </div>
              {entitlement.cancelledAt ? (
                <p className="text-xs text-muted-foreground">취소: {formatDate(entitlement.cancelledAt)}{entitlement.cancelReason ? ` · ${entitlement.cancelReason}` : ""}</p>
              ) : (
                <form action={cancelAdvertisementEntitlementAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="entitlementId" value={entitlement.id} />
                  <input name="reason" aria-label="취소 사유" maxLength={300} placeholder="취소 사유(선택)" className={`${inputClass} min-w-64`} />
                  <Button type="submit" variant="outline" size="sm">계약 취소</Button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>캠페인 승인</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form action={expireAdvertisementCampaignsAction}><Button type="submit" variant="outline" size="sm">종료 캠페인 만료 동기화</Button></form>
          {data.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">등록된 캠페인이 없습니다.</p> : data.campaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-md border border-border p-4 text-sm">
              <div className="font-semibold">{campaign.title}</div>
              <div className="mt-1 text-muted-foreground">{campaign.company?.name ?? "업체 없음"} · {campaign.product?.name ?? "상품 없음"} · {campaign.placement.name} · {campaign.status}</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatDate(campaign.startDate)} ~ {formatDate(campaign.endDate)}</div>
              <form action={setAdvertisementCampaignStatusAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="campaignId" value={campaign.id} />
                {(campaign.status === "PENDING" || campaign.status === "PAUSED") ? <Button name="status" value="ACTIVE" size="sm">승인/재개</Button> : null}
                {campaign.status === "ACTIVE" ? <Button name="status" value="PAUSED" variant="outline" size="sm">일시중지</Button> : null}
                {campaign.status !== "CANCELLED" && campaign.status !== "EXPIRED" ? <Button name="status" value="CANCELLED" variant="outline" size="sm">취소</Button> : null}
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </Container>
  );
}
