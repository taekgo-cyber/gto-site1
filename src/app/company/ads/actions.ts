"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  createCompanyAdvertisementCampaign,
  updateCompanyAdvertisementCampaign,
} from "@/lib/monetization/ads";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(formData: FormData, name: string): Date {
  const value = text(formData, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("ADVERTISEMENT_CAMPAIGN_WINDOW_INVALID");
  }
  const parsed = new Date(`${value}:00+09:00`);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error("ADVERTISEMENT_CAMPAIGN_WINDOW_INVALID");
  return parsed;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    ROLE_NOT_ALLOWED: "광고 캠페인 수정은 OWNER 또는 MANAGER만 가능합니다.",
    MEMBER_INACTIVE: "활성 업체 구성원 권한이 필요합니다.",
    COMPANY_INACTIVE: "활성 업체만 광고를 운영할 수 있습니다.",
    ADVERTISEMENT_CAMPAIGN_WINDOW_INVALID: "광고 시작/종료 시간을 확인해 주세요.",
    ADVERTISEMENT_CAMPAIGN_ENTITLEMENT_INVALID: "선택한 기간을 보장하는 유효 광고상품 권한이 없습니다.",
    ADVERTISEMENT_PLACEMENT_INACTIVE: "선택한 광고 위치를 사용할 수 없습니다.",
    ADVERTISEMENT_LINK_URL_INVALID: "연결 주소는 http/https 또는 사이트 내부 경로만 허용됩니다.",
    ADVERTISEMENT_IMAGE_URL_INVALID: "이미지 주소는 http/https 또는 사이트 내부 경로만 허용됩니다.",
    ADVERTISEMENT_CAMPAIGN_NOT_EDITABLE: "승인 대기 또는 일시중지 캠페인만 수정할 수 있습니다.",
    ADVERTISEMENT_CAMPAIGN_NOT_FOUND: "캠페인을 찾을 수 없습니다.",
  };
  return known[message] ?? "처리 중 오류가 발생했습니다.";
}

function done(companyId: string, message: string, error = false): never {
  const params = new URLSearchParams({ companyId });
  params.set(error ? "error" : "message", message);
  redirect(`/company/ads?${params.toString()}`);
}

export async function createAdvertisementCampaignAction(formData: FormData) {
  const user = await getCurrentUser();
  const companyId = text(formData, "companyId");
  if (!user) done(companyId, "로그인이 필요합니다.", true);
  try {
    await createCompanyAdvertisementCampaign({
      actorUserId: user.id,
      companyId,
      productCode: text(formData, "productCode"),
      placementCode: text(formData, "placementCode"),
      regionId: text(formData, "regionId") || null,
      title: text(formData, "title"),
      imageUrl: text(formData, "imageUrl") || null,
      linkUrl: text(formData, "linkUrl") || null,
      startDate: parseDate(formData, "startDate"),
      endDate: parseDate(formData, "endDate"),
    });
  } catch (error) {
    done(companyId, safeMessage(error), true);
  }
  revalidatePath("/company/ads");
  revalidatePath("/admin/ads");
  done(companyId, "광고 캠페인을 승인 대기 상태로 제출했습니다.");
}

export async function updateAdvertisementCampaignAction(formData: FormData) {
  const user = await getCurrentUser();
  const companyId = text(formData, "companyId");
  if (!user) done(companyId, "로그인이 필요합니다.", true);
  try {
    await updateCompanyAdvertisementCampaign({
      actorUserId: user.id,
      companyId,
      campaignId: text(formData, "campaignId"),
      productCode: text(formData, "productCode"),
      placementCode: text(formData, "placementCode"),
      regionId: text(formData, "regionId") || null,
      title: text(formData, "title"),
      imageUrl: text(formData, "imageUrl") || null,
      linkUrl: text(formData, "linkUrl") || null,
      startDate: parseDate(formData, "startDate"),
      endDate: parseDate(formData, "endDate"),
    });
  } catch (error) {
    done(companyId, safeMessage(error), true);
  }
  revalidatePath("/company/ads");
  revalidatePath("/admin/ads");
  done(companyId, "광고 캠페인을 수정하고 승인 대기로 전환했습니다.");
}