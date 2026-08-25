import { createHmac } from "node:crypto";

export const SUPPORT_TICKET_CATEGORIES = [
  "COMPANY_REGISTRATION",
  "ACCOUNT",
  "POST",
  "PAYMENT_REFUND",
  "ADVERTISEMENT",
  "REPORT",
  "OTHER",
] as const;

export const SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
] as const;

export type SupportTicketCategoryValue = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export type SupportTicketStatusValue = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategoryValue, string> = {
  COMPANY_REGISTRATION: "업체 등록",
  ACCOUNT: "계정",
  POST: "게시물",
  PAYMENT_REFUND: "결제/환불",
  ADVERTISEMENT: "광고",
  REPORT: "신고",
  OTHER: "기타",
};

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatusValue, string> = {
  OPEN: "신규",
  IN_PROGRESS: "처리 중",
  WAITING_CUSTOMER: "고객 확인 대기",
  RESOLVED: "처리 완료",
  CLOSED: "종료",
};

export type CreateSupportTicketInput = {
  requesterName: string;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  category: string;
  subject: string;
  message: string;
  priority?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-()\s]{7,30}$/;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().slice(0, max + 1);
}

export function validateCreateSupportTicket(input: CreateSupportTicketInput) {
  const requesterName = text(input.requesterName, 50);
  const requesterEmail = text(input.requesterEmail, 254).toLowerCase();
  const requesterPhone = text(input.requesterPhone, 30);
  const subject = text(input.subject, 120);
  const message = text(input.message, 4_000);

  if (requesterName.length < 2 || requesterName.length > 50) throw new Error("SUPPORT_NAME_INVALID");
  if (!requesterEmail && !requesterPhone) throw new Error("SUPPORT_CONTACT_REQUIRED");
  if (requesterEmail && !EMAIL_RE.test(requesterEmail)) throw new Error("SUPPORT_EMAIL_INVALID");
  if (requesterPhone && !PHONE_RE.test(requesterPhone)) throw new Error("SUPPORT_PHONE_INVALID");
  if (!(SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(input.category)) throw new Error("SUPPORT_CATEGORY_INVALID");
  if (subject.length < 3 || subject.length > 120) throw new Error("SUPPORT_SUBJECT_INVALID");
  if (message.length < 10 || message.length > 4_000) throw new Error("SUPPORT_MESSAGE_INVALID");

  return {
    requesterName,
    requesterEmail: requesterEmail || null,
    requesterPhone: requesterPhone || null,
    category: input.category as SupportTicketCategoryValue,
    subject,
    message,
    priority: input.priority === "URGENT" ? ("URGENT" as const) : ("NORMAL" as const),
  };
}

export function maskDisplayName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length <= 1) return "고객";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(Math.min(3, chars.length - 2))}${chars.at(-1)}`;
}

export function sanitizeOpsSummary(value: string, maxLength = 80): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 숨김]")
    .replace(/(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/g, "[연락처 숨김]")
    .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, "[민감정보 숨김]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function supportRateWindowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
}

export function buildSupportAbuseKey(input: {
  address: string;
  contact: string;
  secret: string;
  now?: Date;
}): { key: string; windowStart: Date } {
  if (input.secret.length < 32) throw new Error("SUPPORT_ABUSE_PROTECTION_NOT_CONFIGURED");
  const windowStart = supportRateWindowStart(input.now ?? new Date());
  const digest = createHmac("sha256", input.secret)
    .update(`${input.address}|${input.contact.toLowerCase()}|${windowStart.toISOString()}`)
    .digest("hex");
  return { key: digest, windowStart };
}

export function validateAdminReply(message: unknown): string {
  const normalized = text(message, 4_000);
  if (normalized.length < 2 || normalized.length > 4_000) throw new Error("SUPPORT_REPLY_INVALID");
  return normalized;
}

export function validateAdminStatus(status: unknown): SupportTicketStatusValue {
  if (typeof status !== "string" || !(SUPPORT_TICKET_STATUSES as readonly string[]).includes(status)) {
    throw new Error("SUPPORT_STATUS_INVALID");
  }
  return status as SupportTicketStatusValue;
}
