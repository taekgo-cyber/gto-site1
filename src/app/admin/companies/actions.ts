"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { approveCompany, changeCompanyOperationalStatus, rejectCompany } from "@/lib/company/admin";

export type AdminCompanyActionState = {
  success?: boolean;
  message?: string;
  error?: string;
};

function toErrorState(error: unknown): AdminCompanyActionState {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg === "ADMIN_REQUIRED") return { error: "관리자 권한이 필요합니다. (ACTIVE ADMIN)" };
    if (msg === "COMPANY_NOT_FOUND") return { error: "업체를 찾을 수 없습니다." };
    if (msg === "COMPANY_NOT_PENDING") return { error: "승인 대기 상태의 업체만 처리할 수 있습니다." };
    if (msg === "COMPANY_STATUS_REASON_INVALID") return { error: "상태 변경 사유는 2~500자로 입력해 주세요." };
    if (msg === "COMPANY_STATUS_TRANSITION_INVALID") return { error: "ACTIVE와 SUSPENDED 사이에서만 운영 상태를 변경할 수 있습니다." };
    if (msg === "COMPANY_STATUS_CONFLICT") return { error: "다른 관리자가 먼저 상태를 변경했습니다. 새로고침 후 다시 확인해 주세요." };
    // Never expose raw DB/env/stack; generic for unknown
    const safePrefixes = ["ADMIN_", "COMPANY_"];
    if (safePrefixes.some((p) => msg.startsWith(p)) && msg.length < 200 && !msg.toLowerCase().includes("prisma") && !msg.includes("DATABASE_URL")) {
      return { error: msg };
    }
    return { error: "처리 중 오류가 발생했습니다." };
  }
  return { error: "처리 중 오류가 발생했습니다." };
}

export async function changeCompanyStatusAction(
  _prev: AdminCompanyActionState | undefined,
  formData: FormData,
): Promise<AdminCompanyActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const companyId = typeof formData.get("companyId") === "string" ? String(formData.get("companyId")).trim() : "";
  const status = formData.get("status");
  const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")).trim() : "";
  if (!companyId || (status !== "ACTIVE" && status !== "SUSPENDED")) return { error: "상태 변경 요청이 올바르지 않습니다." };
  try {
    await changeCompanyOperationalStatus({ adminUserId: user.id, companyId, status, reason });
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${companyId}`);
    revalidatePath(`/companies/${companyId}`);
    return { success: true, message: status === "ACTIVE" ? "업체 운영을 다시 활성화했습니다." : "업체 운영을 일시 정지했습니다." };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function approveCompanyAction(
  _prev: AdminCompanyActionState | undefined,
  formData: FormData,
): Promise<AdminCompanyActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const companyId = typeof formData.get("companyId") === "string" ? String(formData.get("companyId")).trim() : "";
  if (!companyId) return { error: "업체 정보가 없습니다." };
  // Ignore client actorUserId if present
  try {
    await approveCompany({ adminUserId: user.id, companyId });
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${companyId}`);
    return { success: true, message: "업체가 승인되었습니다. (ACTIVE) 소유자 User.role은 COMPANY로 승격됩니다." };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function rejectCompanyAction(
  _prev: AdminCompanyActionState | undefined,
  formData: FormData,
): Promise<AdminCompanyActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const companyId = typeof formData.get("companyId") === "string" ? String(formData.get("companyId")).trim() : "";
  if (!companyId) return { error: "업체 정보가 없습니다." };
  const reasonRaw = formData.get("reason");
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (reason.length > 500) {
    return { error: "반려 사유는 500자를 초과할 수 없습니다." };
  }
  try {
    await rejectCompany({ adminUserId: user.id, companyId, reason: reason || undefined });
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${companyId}`);
    return { success: true, message: "업체가 반려되었습니다. (REJECTED)" };
  } catch (error) {
    return toErrorState(error);
  }
}
