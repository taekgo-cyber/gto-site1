"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  expireAdvertisementCampaignsByAdmin,
  setAdvertisementCampaignStatusByAdmin,
  syncManagedAdvertisementCatalog,
  upsertAdvertisementPlacementByAdmin,
} from "@/lib/monetization/ads";
import { grantCompanyAdvertisementEntitlement } from "@/lib/monetization/service";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    ADMIN_REQUIRED: "관리자 권한이 필요합니다.",
    COMPANY_INACTIVE: "활성 업체만 처리할 수 있습니다.",
    ADVERTISEMENT_PRODUCT_CODE_INVALID: "광고상품 코드가 올바르지 않습니다.",
    ADVERTISEMENT_PRODUCT_NOT_FOUND: "광고상품을 먼저 정책 동기화해 주세요.",
    ADVERTISEMENT_PRODUCT_POLICY_MISMATCH: "저장된 광고상품 정책이 기준과 다릅니다.",
    ADVERTISEMENT_ENTITLEMENT_IDEMPOTENCY_CONFLICT: "동일 처리키가 다른 권한 부여에 사용되었습니다.",
    ADVERTISEMENT_CAMPAIGN_TRANSITION_INVALID: "현재 상태에서는 해당 변경을 할 수 없습니다.",
    ADVERTISEMENT_CAMPAIGN_ENTITLEMENT_INVALID: "캠페인 기간을 보장하는 유효 상품 권한이 없습니다.",
    ADVERTISEMENT_PLACEMENT_INACTIVE: "활성 광고 위치가 아닙니다.",
  };
  return known[message] ?? "처리 중 오류가 발생했습니다.";
}

function done(message: string, error = false): never {
  const params = new URLSearchParams();
  params.set(error ? "error" : "message", message);
  redirect(`/admin/ads?${params.toString()}`);
}

export async function syncAdvertisementCatalogAction() {
  const user = await getCurrentUser();
  if (!user) done("로그인이 필요합니다.", true);
  try {
    await syncManagedAdvertisementCatalog({ actorUserId: user.id });
  } catch (error) {
    done(safeMessage(error), true);
  }
  revalidatePath("/admin/ads");
  done("광고상품 정책을 동기화했습니다.");
}

export async function upsertAdvertisementPlacementAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) done("로그인이 필요합니다.", true);
  try {
    await upsertAdvertisementPlacementByAdmin({
      actorUserId: user.id,
      code: text(formData, "code"),
      name: text(formData, "name"),
      description: text(formData, "description") || null,
      isActive: text(formData, "isActive") !== "false",
    });
  } catch (error) {
    done(safeMessage(error), true);
  }
  revalidatePath("/admin/ads");
  done("광고 위치를 저장했습니다.");
}

export async function grantAdvertisementEntitlementAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) done("로그인이 필요합니다.", true);
  try {
    await grantCompanyAdvertisementEntitlement({
      actorUserId: user.id,
      companyId: text(formData, "companyId"),
      productCode: text(formData, "productCode"),
      source: "ADMIN",
      sourceReference: text(formData, "sourceReference"),
      idempotencyKey: text(formData, "idempotencyKey"),
    });
  } catch (error) {
    done(safeMessage(error), true);
  }
  revalidatePath("/admin/ads");
  revalidatePath("/company/ads");
  done("업체 광고상품 권한을 부여했습니다.");
}

export async function setAdvertisementCampaignStatusAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) done("로그인이 필요합니다.", true);
  const rawStatus = text(formData, "status");
  if (rawStatus !== "ACTIVE" && rawStatus !== "PAUSED" && rawStatus !== "CANCELLED") {
    done("캠페인 상태가 올바르지 않습니다.", true);
  }
  try {
    await setAdvertisementCampaignStatusByAdmin({
      actorUserId: user.id,
      campaignId: text(formData, "campaignId"),
      status: rawStatus,
    });
  } catch (error) {
    done(safeMessage(error), true);
  }
  revalidatePath("/admin/ads");
  revalidatePath("/company/ads");
  revalidatePath("/");
  done("캠페인 상태를 변경했습니다.");
}

export async function expireAdvertisementCampaignsAction() {
  const user = await getCurrentUser();
  if (!user) done("로그인이 필요합니다.", true);
  let expiredCount = 0;
  try {
    const result = await expireAdvertisementCampaignsByAdmin({ actorUserId: user.id });
    expiredCount = result.expiredCount;
  } catch (error) {
    done(safeMessage(error), true);
  }
  revalidatePath("/admin/ads");
  revalidatePath("/");
  done(`${expiredCount}개 캠페인을 만료 상태로 동기화했습니다.`);
}