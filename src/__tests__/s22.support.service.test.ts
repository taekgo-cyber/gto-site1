import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findUnique: vi.fn() },
  supportTicket: { findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
}));
const notifyMock = vi.hoisted(() => vi.fn().mockResolvedValue({ delivered: true }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications/service", () => ({ createInAppNotification: notifyMock }));

import {
  createSupportTicket,
  getPublicSupportTicket,
  listAdminSupportTickets,
  replyToSupportTicket,
  setSupportTicketStatus,
} from "@/lib/support/service";

const validData = {
  requesterName: "홍길동",
  requesterEmail: "user@example.com",
  category: "ACCOUNT",
  subject: "계정 상태 문의",
  message: "계정 상태를 확인해 주시기 바랍니다.",
};

beforeEach(() => vi.clearAllMocks());

describe("S22 support ticket service", () => {
  it("atomically stores ticket, rate bucket and minimal-PII ops outbox", async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const createTicket = vi.fn().mockResolvedValue({ id: "ticket1", accessToken: "a".repeat(25), status: "OPEN", createdAt: new Date() });
    const createOps = vi.fn().mockResolvedValue({ id: "event1" });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      supportRateLimitBucket: { deleteMany: vi.fn(), upsert }, supportTicket: { create: createTicket }, opsEvent: { create: createOps },
    }));
    const result = await createSupportTicket({ requesterUserId: "u1", data: validData, abuse: { key: "hash", windowStart: new Date() } });
    expect(result.id).toBe("ticket1");
    expect(upsert).toHaveBeenCalled();
    const eventData = createOps.mock.calls[0][0].data;
    expect(eventData.dedupeKey).toBe("support-ticket:ticket1:created");
    expect(eventData.payload.requesterDisplayName).toBe("홍*동");
    expect(JSON.stringify(eventData.payload)).not.toContain("user@example.com");
    expect(JSON.stringify(eventData.payload)).not.toContain("requesterEmail");
  });

  it("rolls the transaction back when the hourly bucket exceeds the bound", async () => {
    const createTicket = vi.fn();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      supportRateLimitBucket: { deleteMany: vi.fn(), upsert: vi.fn().mockResolvedValue({ count: 6 }) }, supportTicket: { create: createTicket }, opsEvent: { create: vi.fn() },
    }));
    await expect(createSupportTicket({ data: validData, abuse: { key: "hash", windowStart: new Date() } })).rejects.toThrow("SUPPORT_RATE_LIMITED");
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("uses an unguessable capability token boundary for anonymous status access", async () => {
    expect(await getPublicSupportTicket("../admin/tickets")).toBeNull();
    expect(prismaMock.supportTicket.findUnique).not.toHaveBeenCalled();
    prismaMock.supportTicket.findUnique.mockResolvedValue({ accessToken: "a".repeat(25), replies: [] });
    await getPublicSupportTicket("a".repeat(25));
    expect(prismaMock.supportTicket.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { accessToken: "a".repeat(25) } }));
  });

  it("rejects non-admin ticket listing before querying ticket PII", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "USER", status: "ACTIVE" });
    await expect(listAdminSupportTickets({ adminUserId: "u1" })).rejects.toThrow("ADMIN_REQUIRED");
    expect(prismaMock.supportTicket.findMany).not.toHaveBeenCalled();
  });

  it("records admin reply, audit, assignment and resolved timestamp together", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    const tx = {
      supportTicket: {
        findUnique: vi.fn().mockResolvedValue({ id: "t1", requesterUserId: "u1", status: "OPEN" }),
        update: vi.fn().mockResolvedValue({ id: "t1", accessToken: "a".repeat(25), status: "RESOLVED" }),
      },
      supportTicketReply: { create: vi.fn().mockResolvedValue({ id: "r1", deliveryStatus: "WEB_ONLY", createdAt: new Date() }) },
      adminLog: { create: vi.fn().mockResolvedValue({ id: "log1" }) },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback(tx));
    const result = await replyToSupportTicket({ adminUserId: "admin", ticketId: "t1", message: "확인 후 처리했습니다.", resolve: true });
    expect(result.ticket.status).toBe("RESOLVED");
    expect(tx.supportTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedAdminId: "admin", status: "RESOLVED", resolvedAt: expect.any(Date) }) }));
    expect(tx.adminLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SUPPORT_REPLY_RESOLVE", targetId: "t1" }) }));
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", href: `/support/tickets/${"a".repeat(25)}` }), tx);
  });

  it("requires a reason for manual status changes and writes provenance", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    await expect(setSupportTicketStatus({ adminUserId: "admin", ticketId: "t1", status: "IN_PROGRESS", reason: "" })).rejects.toThrow("SUPPORT_STATUS_REASON_INVALID");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
