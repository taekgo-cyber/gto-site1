import { prisma } from "@/lib/prisma";
import { createInAppNotification } from "@/lib/notifications/service";
import {
  maskDisplayName,
  sanitizeOpsSummary,
  validateAdminReply,
  validateAdminStatus,
  validateCreateSupportTicket,
  type CreateSupportTicketInput,
  type SupportTicketCategoryValue,
  type SupportTicketStatusValue,
} from "./contract";

const PAGE_SIZE = 20;
const SUPPORT_RATE_LIMIT_PER_HOUR = 5;

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, status: true },
  });
  if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") throw new Error("ADMIN_REQUIRED");
  return admin;
}

export async function createSupportTicket(input: {
  requesterUserId?: string | null;
  data: CreateSupportTicketInput;
  abuse?: { key: string; windowStart: Date };
}) {
  const data = validateCreateSupportTicket(input.data);

  return prisma.$transaction(async (tx) => {
    if (input.abuse) {
      await tx.supportRateLimitBucket.deleteMany({
        where: {
          windowStart: {
            lt: new Date(input.abuse.windowStart.getTime() - 48 * 60 * 60_000),
          },
        },
      });
      const bucket = await tx.supportRateLimitBucket.upsert({
        where: { key: input.abuse.key },
        create: { key: input.abuse.key, windowStart: input.abuse.windowStart, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      if (bucket.count > SUPPORT_RATE_LIMIT_PER_HOUR) throw new Error("SUPPORT_RATE_LIMITED");
    }

    const ticket = await tx.supportTicket.create({
      data: {
        requesterUserId: input.requesterUserId ?? null,
        requesterName: data.requesterName,
        requesterEmail: data.requesterEmail,
        requesterPhone: data.requesterPhone,
        category: data.category,
        subject: data.subject,
        message: data.message,
        priority: data.priority,
      },
      select: { id: true, accessToken: true, status: true, createdAt: true },
    });

    await tx.opsEvent.create({
      data: {
        type: "SUPPORT_TICKET",
        dedupeKey: `support-ticket:${ticket.id}:created`,
        targetType: "SupportTicket",
        targetId: ticket.id,
        payload: {
          ticketId: ticket.id,
          category: data.category,
          priority: data.priority,
          requesterDisplayName: maskDisplayName(data.requesterName),
          summary: sanitizeOpsSummary(data.subject),
          adminPath: `/admin/tickets/${ticket.id}`,
        },
      },
    });

    return ticket;
  });
}

export async function getPublicSupportTicket(accessToken: string) {
  if (!/^[a-z0-9]{20,40}$/i.test(accessToken)) return null;
  return prisma.supportTicket.findUnique({
    where: { accessToken },
    select: {
      accessToken: true,
      category: true,
      subject: true,
      message: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      replies: {
        where: { authorType: { in: ["ADMIN", "SYSTEM"] } },
        select: { id: true, authorType: true, message: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

function normalizedPage(page: number): number {
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

export async function listAdminSupportTickets(input: {
  adminUserId: string;
  query?: string;
  status?: SupportTicketStatusValue | "ALL";
  category?: SupportTicketCategoryValue | "ALL";
  page?: number;
}) {
  await assertActiveAdmin(input.adminUserId);
  const page = normalizedPage(input.page ?? 1);
  const query = input.query?.trim().slice(0, 100) ?? "";
  const where = {
    ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
    ...(input.category && input.category !== "ALL" ? { category: input.category } : {}),
    ...(query
      ? {
          OR: [
            { id: { contains: query, mode: "insensitive" as const } },
            { subject: { contains: query, mode: "insensitive" as const } },
            { requesterName: { contains: query, mode: "insensitive" as const } },
            { requesterEmail: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      select: {
        id: true,
        category: true,
        subject: true,
        requesterName: true,
        status: true,
        priority: true,
        assignedAdmin: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getAdminSupportTicket(input: { adminUserId: string; ticketId: string }) {
  await assertActiveAdmin(input.adminUserId);
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      accessToken: true,
      requesterName: true,
      requesterEmail: true,
      requesterPhone: true,
      category: true,
      subject: true,
      message: true,
      status: true,
      priority: true,
      assignedAdmin: { select: { id: true, name: true, email: true } },
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      replies: {
        select: {
          id: true,
          authorType: true,
          message: true,
          deliveryStatus: true,
          deliveredAt: true,
          createdAt: true,
          admin: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  return ticket;
}

export async function replyToSupportTicket(input: {
  adminUserId: string;
  ticketId: string;
  message: unknown;
  resolve?: boolean;
}) {
  await assertActiveAdmin(input.adminUserId);
  const message = validateAdminReply(input.message);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, requesterUserId: true, status: true },
    });
    if (!current) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    if (current.status === "CLOSED") throw new Error("SUPPORT_TICKET_CLOSED");

    const reply = await tx.supportTicketReply.create({
      data: {
        ticketId: input.ticketId,
        authorType: "ADMIN",
        adminUserId: input.adminUserId,
        message,
        deliveryStatus: "WEB_ONLY",
      },
      select: { id: true, deliveryStatus: true, createdAt: true },
    });
    const ticket = await tx.supportTicket.update({
      where: { id: input.ticketId },
      data: {
        assignedAdminId: input.adminUserId,
        status: input.resolve ? "RESOLVED" : "WAITING_CUSTOMER",
        lastResponseAt: now,
        resolvedAt: input.resolve ? now : null,
      },
      select: { id: true, accessToken: true, status: true },
    });
    await tx.adminLog.create({
      data: {
        adminId: input.adminUserId,
        action: input.resolve ? "SUPPORT_REPLY_RESOLVE" : "SUPPORT_REPLY",
        targetType: "SupportTicket",
        targetId: input.ticketId,
        metadata: { ticketId: input.ticketId, replyId: reply.id, delivery: "WEB_ONLY" },
      },
    });
    if (current.requesterUserId) {
      await createInAppNotification(
        {
          userId: current.requesterUserId,
          type: "ACTIVITY",
          title: "문의에 답변이 등록되었습니다",
          body: "문의 상태 페이지에서 답변을 확인해 주세요.",
          href: `/support/tickets/${ticket.accessToken}`,
          dedupeKey: `support-ticket:${ticket.id}:reply:${reply.id}`,
        },
        tx,
      );
    }
    return { ticket, reply };
  });
  return result;
}

export async function setSupportTicketStatus(input: {
  adminUserId: string;
  ticketId: string;
  status: unknown;
  reason: unknown;
}) {
  await assertActiveAdmin(input.adminUserId);
  const status = validateAdminStatus(input.status);
  const reason = typeof input.reason === "string" ? input.reason.normalize("NFKC").trim() : "";
  if (reason.length < 2 || reason.length > 500) throw new Error("SUPPORT_STATUS_REASON_INVALID");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.supportTicket.findUnique({ where: { id: input.ticketId }, select: { id: true, status: true } });
    if (!current) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    if (current.status === status) return { id: current.id, status: current.status };
    const ticket = await tx.supportTicket.update({
      where: { id: input.ticketId },
      data: {
        status,
        assignedAdminId: input.adminUserId,
        resolvedAt: status === "RESOLVED" || status === "CLOSED" ? now : null,
      },
      select: { id: true, status: true },
    });
    await tx.adminLog.create({
      data: {
        adminId: input.adminUserId,
        action: "SUPPORT_STATUS_CHANGE",
        targetType: "SupportTicket",
        targetId: input.ticketId,
        metadata: { from: current.status, to: status, reason },
      },
    });
    return ticket;
  });
}
