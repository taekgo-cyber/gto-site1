import type {
  JobPostStatus,
  JobPostType,
  PayType,
  WorkType,
} from "@/generated/prisma/enums";

const JOB_POST_TYPE_LABELS: Record<JobPostType, string> = {
  JOB: "구인",
  TRANSPORT: "운송",
};

const JOB_POST_STATUS_LABELS: Record<JobPostStatus, string> = {
  DRAFT: "임시저장",
  OPEN: "모집중",
  CLOSED: "마감",
  HIDDEN: "숨김",
};

const PAY_TYPE_LABELS: Record<PayType, string> = {
  MONTHLY: "월급",
  DAILY: "일급",
  FREIGHT: "운임",
  NEGOTIABLE: "협의",
};

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  FULL_TIME: "정규직",
  PART_TIME: "아르바이트",
  CONTRACT: "계약직",
  DAILY: "일용직",
  FREELANCE: "프리랜서",
};

export function jobPostTypeLabel(type: JobPostType): string {
  return JOB_POST_TYPE_LABELS[type];
}

export function jobPostStatusLabel(status: JobPostStatus): string {
  return JOB_POST_STATUS_LABELS[status];
}

export function payTypeLabel(payType: PayType): string {
  return PAY_TYPE_LABELS[payType];
}

export function workTypeLabel(workType: WorkType): string {
  return WORK_TYPE_LABELS[workType];
}

export function formatPayAmount(
  payType: PayType | null,
  payAmount: number | null,
): string {
  if (!payType) return "조건 협의";
  if (payType === "NEGOTIABLE" || !payAmount) return "협의";

  const unit = payType === "FREIGHT" ? "만원/회" : "만원";
  return `${payAmount.toLocaleString("ko-KR")}${unit}`;
}

export function formatDate(date: Date | null): string {
  if (!date) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}
