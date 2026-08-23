"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import {
  AD_ATTRIBUTION_COOKIE,
  recordAdvertisementConversionFromAttribution,
} from "@/lib/analytics/ads";
import { LEAD_CONSENT_VERSION } from "./constants";
import {
  activateCandidateLead,
  createCandidateLead,
  transitionOwnedLeadStatus,
  updateCandidateLead,
} from "./service";

export type LeadActionState = {
  success?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const WORK_TYPES = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY", "FREELANCE"]);

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function integer(formData: FormData, key: string): number | null {
  const value = text(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function dateValue(formData: FormData, key: string): Date | null {
  const value = text(formData, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("invalid") : date;
}

function mutableLeadData(formData: FormData) {
  const desiredWorkType = text(formData, "desiredWorkType");
  return {
    preferredRegionId: text(formData, "preferredRegionId"),
    vehicleTypeId: text(formData, "vehicleTypeId"),
    tonnageId: text(formData, "tonnageId"),
    experienceYears: integer(formData, "experienceYears"),
    leaseExperience: formData.get("leaseExperience") === "on" ? true : formData.get("leaseExperience") === "off" ? false : null,
    vehicleOwned: formData.get("vehicleOwned") === "on" ? true : formData.get("vehicleOwned") === "off" ? false : null,
    licenseInfo: text(formData, "licenseInfo"),
    desiredWorkType: desiredWorkType && WORK_TYPES.has(desiredWorkType) ? desiredWorkType as never : null,
    desiredIncomeMin: integer(formData, "desiredIncomeMin"),
    desiredIncomeMax: integer(formData, "desiredIncomeMax"),
    availableFrom: dateValue(formData, "availableFrom"),
    careerSummary: text(formData, "careerSummary"),
    expiresAt: dateValue(formData, "expiresAt"),
  };
}

function actionError(error: unknown): LeadActionState {
  return { error: error instanceof Error ? error.message : "저장하지 못했습니다." };
}

export async function saveCandidateLead(
  _previous: LeadActionState | undefined,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireUser();
  let saveError: LeadActionState | null = null;
  try {
    const data = mutableLeadData(formData);
    const leadId = text(formData, "leadId");
    if (leadId) {
      await updateCandidateLead({ userId: user.id, leadId, data });
    } else {
      await createCandidateLead({ userId: user.id, data });
    }
  } catch (error) {
    saveError = actionError(error);
  }
  if (saveError) return saveError;
  revalidatePath("/mypage");
  revalidatePath("/mypage/lead");
  redirect("/mypage/lead");
}

export async function activateCandidateLeadAction(
  _previous: LeadActionState | undefined,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireUser();
  try {
    const leadId = text(formData, "leadId");
    if (!leadId) return { error: "먼저 임시 저장해 주세요." };
    if (formData.get("consent") !== "on") return { error: "연락처 제공 동의가 필요합니다." };

    await activateCandidateLead({
      userId: user.id,
      leadId,
      consentVersion: LEAD_CONSENT_VERSION,
    });
    try {
      const cookieStore = await cookies();
      const attributionToken = cookieStore.get(AD_ATTRIBUTION_COOKIE)?.value;
      if (attributionToken) {
        try {
          await recordAdvertisementConversionFromAttribution({ attributionToken });
        } finally {
          cookieStore.delete(AD_ATTRIBUTION_COOKIE);
        }
      }
    } catch {
      // Analytics attribution is best-effort and must never invalidate a successful Lead activation.
    }
    revalidatePath("/mypage");
    revalidatePath("/mypage/lead");
    return { success: true, message: "구직정보가 공개되었습니다." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCandidateLeadStatus(
  _previous: LeadActionState | undefined,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireUser();
  try {
    const leadId = text(formData, "leadId");
    const intent = text(formData, "intent");
    if (!leadId || !intent) return { error: "잘못된 요청입니다." };

    if (intent === "pause" || intent === "resume") {
      await transitionOwnedLeadStatus({
        userId: user.id,
        leadId,
        targetStatus: intent === "pause" ? "PAUSED" : "ACTIVE",
      });
    } else if (intent === "close") {
      await transitionOwnedLeadStatus({
        userId: user.id,
        leadId,
        targetStatus: "CLOSED",
        closeReason: "USER_CLOSED",
      });
    } else {
      return { error: "지원하지 않는 상태 변경입니다." };
    }

    revalidatePath("/mypage");
    revalidatePath("/mypage/lead");
    return { success: true, message: "구직정보 상태가 변경되었습니다." };
  } catch (error) {
    return actionError(error);
  }
}
