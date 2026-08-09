import type { PayType, WorkType, LeasePostStatus } from "@/generated/prisma/enums";
import { payTypeLabel, workTypeLabel } from "@/lib/jobs/labels";
import { leasePostStatusLabel } from "@/lib/posts/labels";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
};

export const PAY_TYPE_OPTIONS: SelectOption<PayType>[] = (
  ["MONTHLY", "DAILY", "FREIGHT", "NEGOTIABLE"] as PayType[]
).map((value) => ({ value, label: payTypeLabel(value) }));

export const WORK_TYPE_OPTIONS: SelectOption<WorkType>[] = (
  ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY", "FREELANCE"] as WorkType[]
).map((value) => ({ value, label: workTypeLabel(value) }));

export const CREATE_STATUS_OPTIONS: SelectOption<LeasePostStatus>[] = (
  ["PUBLISHED", "DRAFT"] as LeasePostStatus[]
).map((value) => ({ value, label: leasePostStatusLabel(value) }));

export const EDIT_STATUS_OPTIONS: SelectOption<LeasePostStatus>[] = (
  ["PUBLISHED", "DRAFT", "CLOSED"] as LeasePostStatus[]
).map((value) => ({ value, label: leasePostStatusLabel(value) }));
