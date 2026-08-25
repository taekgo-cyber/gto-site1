"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import {
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  updateNotificationPreferences,
} from "@/lib/notifications/service";

function refreshInbox(): void {
  revalidatePath("/notifications");
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const value = formData.get("notificationId");
  const notificationId = typeof value === "string" ? value.trim() : "";
  if (!notificationId || notificationId.length > 100) return;
  await markInAppNotificationRead(user.id, notificationId);
  refreshInbox();
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllInAppNotificationsRead(user.id);
  refreshInbox();
}

export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await updateNotificationPreferences(user.id, {
    activityEnabled: formData.get("activityEnabled") === "on",
    contentEnabled: formData.get("contentEnabled") === "on",
  });
  refreshInbox();
}
