"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import {
  applyForCompany,
  getCompanyApplicationForOwner,
  resubmitCompanyApplication,
  updateCompanyByOwner,
} from "@/lib/company/service";
import type { CompanyApplicationInput } from "@/lib/company/validation";

export type CompanyActionState = {
  success?: boolean;
  message?: string;
  error?: string;
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function parseCompanyInput(formData: FormData): CompanyApplicationInput {
  return {
    name: text(formData, "name"),
    businessNumber: text(formData, "businessNumber"),
    representativeName: text(formData, "representativeName"),
    phone: optionalText(formData, "phone"),
    email: optionalText(formData, "email"),
    address: optionalText(formData, "address"),
    addressDetail: optionalText(formData, "addressDetail"),
    regionId: optionalText(formData, "regionId"),
    introduction: optionalText(formData, "introduction"),
  };
}

function toErrorState(error: unknown): CompanyActionState {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg === "DUPLICATE_COMPANY_APPLICATION") return { error: "이미 업체 신청 내역이 있어 새로 신청할 수 없습니다. 기존 신청을 수정하거나 재신청해 주세요." };
    if (msg === "BUSINESS_NUMBER_DUPLICATE") return { error: "이미 등록된 사업자등록번호입니다." };
    if (msg === "NOT_OWNER_MEMBER") return { error: "업체 소유자 권한이 필요합니다." };
    if (msg === "COMPANY_NOT_FOUND") return { error: "업체 정보를 찾을 수 없습니다." };
    if (msg === "COMPANY_NOT_EDITABLE") return { error: "승인 대기 또는 반려 상태에서만 수정할 수 있습니다." };
    if (msg === "NO_FIELDS_TO_UPDATE") return { error: "수정할 항목이 없습니다." };
    if (msg === "COMPANY_NOT_REJECTED") return { error: "반려된 신청만 재신청할 수 있습니다." };
    if (msg === "USER_INACTIVE") return { error: "비활성화된 계정으로 신청할 수 없습니다." };
    // Prisma unique constraint or env leaks — never expose raw DB/env/stack
    const code = (error as unknown as { code?: string })?.code;
    if (code === "P2002") return { error: "이미 등록된 사업자등록번호입니다." };
    // Filter known safe prefixes; otherwise generic
    const safePrefixes = ["DUPLICATE_", "BUSINESS_", "NOT_", "COMPANY_", "USER_", "ADMIN_", "name", "businessNumber", "representative", "phone", "email", "address", "introduction"];
    if (safePrefixes.some((p) => msg.startsWith(p)) && msg.length < 200 && !msg.includes("prisma") && !msg.includes("DATABASE_URL") && !msg.includes("stack")) {
      return { error: msg };
    }
    return { error: "처리 중 오류가 발생했습니다." };
  }
  return { error: "처리 중 오류가 발생했습니다." };
}

export async function applyCompanyAction(
  _prev: CompanyActionState | undefined,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  // Never trust client actorUserId; form field if present is ignored
  if (formData.get("actorUserId")) {
    // intentionally ignored — server actor is authoritative
  }
  try {
    const data = parseCompanyInput(formData);
    await applyForCompany({ actorUserId: user.id, data });
    revalidatePath("/company/apply");
    return { success: true, message: "업체 등록 신청이 접수되었습니다. 승인 심사 중입니다." };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function updateCompanyAction(
  _prev: CompanyActionState | undefined,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const companyId = text(formData, "companyId");
  if (!companyId) return { error: "업체 정보가 없습니다." };
  try {
    const data: Partial<CompanyApplicationInput> = {};
    const fields: Array<keyof CompanyApplicationInput> = [
      "name",
      "businessNumber",
      "representativeName",
      "phone",
      "email",
      "address",
      "addressDetail",
      "regionId",
      "introduction",
    ];
    for (const key of fields) {
      const raw = formData.get(key);
      if (raw === null) continue;
      const value = typeof raw === "string" ? raw.trim() : "";
      // For edit, empty string means clear optional field -> null
      if (key === "name" || key === "businessNumber" || key === "representativeName") {
        if (value !== "") data[key] = value;
        else data[key] = value;
      } else {
        data[key] = value === "" ? null : value;
      }
    }
    // Remove undefined keys where form sent empty for required? Keep validation to throw
    await updateCompanyByOwner({ actorUserId: user.id, companyId, data });
    revalidatePath("/company/apply");
    return { success: true, message: "업체 정보가 수정되었습니다." };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function resubmitCompanyAction(
  _prev: CompanyActionState | undefined,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const companyId = text(formData, "companyId");
  if (!companyId) return { error: "업체 정보가 없습니다." };
  try {
    const data: Partial<CompanyApplicationInput> = {};
    const fields: Array<keyof CompanyApplicationInput> = [
      "name",
      "businessNumber",
      "representativeName",
      "phone",
      "email",
      "address",
      "addressDetail",
      "regionId",
      "introduction",
    ];
    for (const key of fields) {
      const raw = formData.get(key);
      if (raw === null) continue;
      const value = typeof raw === "string" ? raw.trim() : "";
      if (key === "name" || key === "businessNumber" || key === "representativeName") {
        if (value !== "") data[key] = value;
        else data[key] = value;
      } else {
        data[key] = value === "" ? null : value;
      }
    }
    const hasEdit = Object.keys(data).length > 0;
    await resubmitCompanyApplication({
      actorUserId: user.id,
      companyId,
      data: hasEdit ? data : undefined,
    });
    revalidatePath("/company/apply");
    return { success: true, message: "재신청이 접수되었습니다. 승인 심사 중입니다." };
  } catch (error) {
    return toErrorState(error);
  }
}

// Helper for page to fetch owned application without requiring User.role COMPANY
export async function getOwnedCompanyApplication(companyId: string) {
  const user = await requireUser();
  return getCompanyApplicationForOwner({ actorUserId: user.id, companyId });
}
