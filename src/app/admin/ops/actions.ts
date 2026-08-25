"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { dispatchPendingOpsEvents, enqueueDailyOpsDigest, retryOpsEvent } from "@/lib/ops/service";

export async function sendOpsDigestAction() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  await enqueueDailyOpsDigest();
  const result = await dispatchPendingOpsEvents({});
  revalidatePath("/admin/ops");
  redirect(`/admin/ops?message=${encodeURIComponent(`전송 처리 ${result.claimed}건 · 성공 ${result.sent} · 실패 ${result.failed}`)}`);
}

export async function retryOpsEventAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const eventId = typeof formData.get("eventId") === "string" ? String(formData.get("eventId")) : "";
  try {
    await retryOpsEvent({ adminUserId: user.id, eventId });
    revalidatePath("/admin/ops");
    redirect("/admin/ops?message=" + encodeURIComponent("재시도 대기열에 등록했습니다."));
  } catch (error) {
    if ((error as { digest?: string })?.digest) throw error;
    redirect("/admin/ops?error=" + encodeURIComponent("재시도할 수 없는 이벤트입니다."));
  }
}
