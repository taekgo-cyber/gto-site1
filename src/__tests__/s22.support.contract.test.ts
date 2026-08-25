import { describe, expect, it } from "vitest";
import {
  buildSupportAbuseKey,
  maskDisplayName,
  sanitizeOpsSummary,
  validateAdminReply,
  validateCreateSupportTicket,
} from "@/lib/support/contract";

describe("S22 support contract", () => {
  it("validates and normalizes a ticket without weakening contact requirements", () => {
    const result = validateCreateSupportTicket({
      requesterName: "  홍길동  ",
      requesterEmail: "USER@Example.com ",
      category: "COMPANY_REGISTRATION",
      subject: " 업체 등록 확인 요청 ",
      message: "업체 등록 상태를 확인해 주시기 바랍니다.",
      priority: "URGENT",
    });
    expect(result).toMatchObject({ requesterName: "홍길동", requesterEmail: "user@example.com", priority: "URGENT" });
    expect(() => validateCreateSupportTicket({ requesterName: "홍길동", category: "OTHER", subject: "문의 제목", message: "충분히 긴 문의 내용입니다." })).toThrow("SUPPORT_CONTACT_REQUIRED");
  });

  it("minimizes Telegram PII in display name and summary", () => {
    expect(maskDisplayName("홍길동")).toBe("홍*동");
    const summary = sanitizeOpsSummary("전화 010-1234-5678 이메일 user@example.com 주민 900101-1234567 확인");
    expect(summary).toContain("[연락처 숨김]");
    expect(summary).toContain("[이메일 숨김]");
    expect(summary).toContain("[민감정보 숨김]");
    expect(summary).not.toContain("010-1234-5678");
    expect(summary).not.toContain("user@example.com");
  });

  it("creates deterministic hourly abuse keys without storing raw identifiers", () => {
    const input = { address: "203.0.113.9", contact: "user@example.com", secret: "x".repeat(32), now: new Date("2026-08-25T03:30:00Z") };
    const first = buildSupportAbuseKey(input);
    const second = buildSupportAbuseKey({ ...input, now: new Date("2026-08-25T03:59:59Z") });
    expect(first).toEqual(second);
    expect(first.key).toMatch(/^[a-f0-9]{64}$/);
    expect(first.key).not.toContain(input.address);
    expect(() => buildSupportAbuseKey({ ...input, secret: "short" })).toThrow("SUPPORT_ABUSE_PROTECTION_NOT_CONFIGURED");
  });

  it("rejects empty or oversized admin replies", () => {
    expect(validateAdminReply(" 답변입니다. ")).toBe("답변입니다.");
    expect(() => validateAdminReply(" ")).toThrow("SUPPORT_REPLY_INVALID");
    expect(() => validateAdminReply("a".repeat(4_001))).toThrow("SUPPORT_REPLY_INVALID");
  });
});
