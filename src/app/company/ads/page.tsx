import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCompanyMemberships, requireUser } from "@/lib/auth/dal";
import { resolveActiveCompanyId } from "@/lib/company/context";
import {
  listActiveAdvertisementPlacementsForCompany,
  listCompanyAdvertisementCampaigns,
} from "@/lib/monetization/ads";
import { listActiveCompanyAdvertisementEntitlements } from "@/lib/monetization/service";
import { createAdvertisementCampaignAction, updateAdvertisementCampaignAction } from "./actions";

export const metadata: Metadata = { title: "광고 캠페인 - 기업" };
export const dynamic = "force-dynamic";

type SearchParams = { companyId?: string; message?: string; error?: string };
const inputClass = "h-11 rounded-md border border-border bg-background px-3 text-base sm:text-sm";

function localInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
  return parts.replace(" ", "T");
}

export default async function CompanyAdsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await requireUser();
  const memberships = await getCompanyMemberships(user.id);
  let selectedCompanyId: string | null = null;
  let requireSelection = false;
  try {
    const resolved = resolveActiveCompanyId({ memberships, selectedCompanyId: params.companyId ?? null });
    if (resolved.companyId) selectedCompanyId = resolved.companyId;
    else if ("requireSelection" in resolved && resolved.requireSelection) requireSelection = true;
  } catch {
    return <Container className="py-8"><Card><CardHeader><CardTitle>광고 운영 접근 불가</CardTitle></CardHeader><CardContent>선택한 업체 권한을 확인할 수 없습니다.</CardContent></Card></Container>;
  }

  if (requireSelection) {
    return (
      <Container className="mx-auto max-w-2xl py-8"><Card><CardHeader><CardTitle>업체 선택</CardTitle></CardHeader><CardContent>
        <form method="get" className="flex gap-2">
          <select name="companyId" aria-label="업체" required defaultValue="" className={`${inputClass} flex-1`}><option value="" disabled>업체 선택</option>{memberships.filter((m) => m.companyStatus === "ACTIVE" && m.status === "ACTIVE").map((m) => <option key={m.companyId} value={m.companyId}>{m.companyName} ({m.role})</option>)}</select>
          <Button type="submit" variant="outline">선택</Button>
        </form>
      </CardContent></Card></Container>
    );
  }
  if (!selectedCompanyId) {
    return <Container className="py-8"><Card><CardHeader><CardTitle>광고 캠페인</CardTitle></CardHeader><CardContent>활성 업체 소속이 없습니다.</CardContent></Card></Container>;
  }

  const [entitlements, placements, campaigns] = await Promise.all([
    listActiveCompanyAdvertisementEntitlements({ actorUserId: user.id, companyId: selectedCompanyId }),
    listActiveAdvertisementPlacementsForCompany({ actorUserId: user.id, companyId: selectedCompanyId }),
    listCompanyAdvertisementCampaigns({ actorUserId: user.id, companyId: selectedCompanyId }),
  ]);
  const productOptions = entitlements
    .map((entitlement) => entitlement.productEntitlement?.product)
    .filter((product): product is NonNullable<typeof product> => Boolean(product?.code));
  const membership = memberships.find((m) => m.companyId === selectedCompanyId);
  const canWrite = membership?.role === "OWNER" || membership?.role === "MANAGER";
  return (
    <Container className="space-y-6 py-8">
      <div><h1 className="text-2xl font-bold">광고 캠페인</h1><p className="mt-1 text-sm text-muted-foreground">{membership?.companyName} · {membership?.role}</p></div>
      {params.message ? <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{params.message}</p> : null}
      {params.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p> : null}

      <Card><CardHeader><CardTitle>활성 광고상품 권한</CardTitle></CardHeader><CardContent className="space-y-2">
        {entitlements.length === 0 ? <p className="text-sm text-muted-foreground">활성 광고상품 권한이 없습니다.</p> : entitlements.map((entitlement) => <div key={entitlement.id} className="rounded-md border border-border p-3 text-sm">{entitlement.productEntitlement?.product.name ?? entitlement.recruitmentTier} · {entitlement.recruitmentTier} · 만료 {entitlement.expiresAt ? entitlement.expiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음"}</div>)}
      </CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle>새 캠페인 제출</CardTitle></CardHeader><CardContent>
        <form action={createAdvertisementCampaignAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="companyId" value={selectedCompanyId} />
          <input name="title" aria-label="광고 제목" required maxLength={100} placeholder="광고 제목" className={inputClass} />
          <select name="productCode" aria-label="광고상품" required defaultValue="" className={inputClass}><option value="" disabled>상품 선택</option>{productOptions.map((product) => <option key={product.code} value={product.code!}>{product.name}</option>)}</select>
          <select name="placementCode" aria-label="광고 위치" required defaultValue="" className={inputClass}><option value="" disabled>광고 위치 선택</option>{placements.map((placement) => <option key={placement.id} value={placement.code}>{placement.name} ({placement.code})</option>)}</select>
          <input name="regionId" aria-label="지역 ID" placeholder="지역 ID (선택)" className={inputClass} />
          <input name="linkUrl" aria-label="연결 URL" placeholder="연결 URL (선택)" className={inputClass} />
          <input name="imageUrl" aria-label="이미지 URL" placeholder="이미지 URL (선택)" className={inputClass} />
          <input type="datetime-local" name="startDate" aria-label="시작 일시" required className={inputClass} />
          <input type="datetime-local" name="endDate" aria-label="종료 일시" required className={inputClass} />
          <div className="md:col-span-2"><Button type="submit" disabled={productOptions.length === 0 || placements.length === 0}>승인 요청</Button></div>
        </form>
      </CardContent></Card> : <Card><CardHeader><CardTitle>읽기 전용</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">STAFF는 캠페인 현황을 조회할 수 있지만 생성·수정할 수 없습니다.</CardContent></Card>}

      <Card><CardHeader><CardTitle>캠페인 현황</CardTitle></CardHeader><CardContent className="space-y-3">
        {campaigns.length === 0 ? <p className="text-sm text-muted-foreground">캠페인이 없습니다.</p> : campaigns.map((campaign) => (
          <div key={campaign.id} className="rounded-md border border-border p-4 text-sm">
            <div className="font-semibold">{campaign.title}</div>
            <div className="mt-1 text-muted-foreground">{campaign.product?.name ?? "상품 없음"} · {campaign.placement.name} · {campaign.status}</div>
            <div className="mt-1 text-xs text-muted-foreground">{campaign.startDate.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} ~ {campaign.endDate.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</div>
            {canWrite && (campaign.status === "PENDING" || campaign.status === "PAUSED") ? <form action={updateAdvertisementCampaignAction} className="mt-3 grid gap-2 md:grid-cols-2">
              <input type="hidden" name="companyId" value={selectedCompanyId} /><input type="hidden" name="campaignId" value={campaign.id} />
              <input name="title" aria-label="광고 제목" required defaultValue={campaign.title} className={inputClass} />
              <select name="productCode" aria-label="광고상품" required defaultValue={campaign.product?.code ?? ""} className={inputClass}>{productOptions.map((product) => <option key={product.code} value={product.code!}>{product.name}</option>)}</select>
              <select name="placementCode" aria-label="광고 위치" required defaultValue={campaign.placement.code} className={inputClass}>{placements.map((placement) => <option key={placement.id} value={placement.code}>{placement.name}</option>)}</select>
              <input name="regionId" aria-label="지역 ID" defaultValue={campaign.regionId ?? ""} placeholder="지역 ID" className={inputClass} />
              <input name="linkUrl" aria-label="연결 URL" defaultValue={campaign.linkUrl ?? ""} placeholder="연결 URL" className={inputClass} />
              <input name="imageUrl" aria-label="이미지 URL" defaultValue={campaign.imageUrl ?? ""} placeholder="이미지 URL" className={inputClass} />
              <input type="datetime-local" name="startDate" aria-label="시작 일시" required defaultValue={localInput(campaign.startDate)} className={inputClass} />
              <input type="datetime-local" name="endDate" aria-label="종료 일시" required defaultValue={localInput(campaign.endDate)} className={inputClass} />
              <div className="md:col-span-2"><Button type="submit" variant="outline" size="sm">수정 후 재승인 요청</Button></div>
            </form> : null}
          </div>
        ))}
      </CardContent></Card>
    </Container>
  );
}
