-- S22 is additive only: support tickets, the Telegram-neutral operations outbox,
-- webhook replay receipts, and a privacy-preserving support rate-limit bucket.

CREATE TYPE "SupportTicketCategory" AS ENUM (
  'COMPANY_REGISTRATION', 'ACCOUNT', 'POST', 'PAYMENT_REFUND',
  'ADVERTISEMENT', 'REPORT', 'OTHER'
);

CREATE TYPE "SupportTicketStatus" AS ENUM (
  'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'
);

CREATE TYPE "SupportTicketPriority" AS ENUM ('NORMAL', 'URGENT');
CREATE TYPE "SupportReplyAuthorType" AS ENUM ('ADMIN', 'CUSTOMER', 'SYSTEM');
CREATE TYPE "SupportReplyDeliveryStatus" AS ENUM ('WEB_ONLY', 'PENDING', 'SENT', 'FAILED');
CREATE TYPE "OpsEventType" AS ENUM ('COMPANY_APPLICATION', 'SUPPORT_TICKET', 'OPS_EXCEPTION', 'DAILY_DIGEST');
CREATE TYPE "OpsEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "requesterUserId" TEXT,
  "requesterName" TEXT NOT NULL,
  "requesterEmail" TEXT,
  "requesterPhone" TEXT,
  "category" "SupportTicketCategory" NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "assignedAdminId" TEXT,
  "lastResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_replies" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorType" "SupportReplyAuthorType" NOT NULL,
  "adminUserId" TEXT,
  "message" TEXT NOT NULL,
  "deliveryStatus" "SupportReplyDeliveryStatus" NOT NULL DEFAULT 'WEB_ONLY',
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_rate_limit_buckets" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ops_events" (
  "id" TEXT NOT NULL,
  "type" "OpsEventType" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OpsEventStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "telegramMessageId" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_webhook_receipts" (
  "updateId" TEXT NOT NULL,
  "actorTelegramUserId" TEXT,
  "command" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "telegram_webhook_receipts_pkey" PRIMARY KEY ("updateId")
);

CREATE UNIQUE INDEX "support_tickets_accessToken_key" ON "support_tickets"("accessToken");
CREATE INDEX "support_tickets_status_priority_createdAt_idx" ON "support_tickets"("status", "priority", "createdAt" DESC);
CREATE INDEX "support_tickets_category_status_createdAt_idx" ON "support_tickets"("category", "status", "createdAt" DESC);
CREATE INDEX "support_tickets_requesterUserId_createdAt_idx" ON "support_tickets"("requesterUserId", "createdAt" DESC);
CREATE INDEX "support_tickets_assignedAdminId_status_idx" ON "support_tickets"("assignedAdminId", "status");
CREATE INDEX "support_ticket_replies_ticketId_createdAt_idx" ON "support_ticket_replies"("ticketId", "createdAt");
CREATE INDEX "support_ticket_replies_adminUserId_createdAt_idx" ON "support_ticket_replies"("adminUserId", "createdAt" DESC);
CREATE INDEX "support_rate_limit_buckets_windowStart_idx" ON "support_rate_limit_buckets"("windowStart");
CREATE UNIQUE INDEX "ops_events_dedupeKey_key" ON "ops_events"("dedupeKey");
CREATE INDEX "ops_events_status_nextAttemptAt_createdAt_idx" ON "ops_events"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "ops_events_type_createdAt_idx" ON "ops_events"("type", "createdAt" DESC);
CREATE INDEX "telegram_webhook_receipts_receivedAt_idx" ON "telegram_webhook_receipts"("receivedAt");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requesterUserId_fkey"
  FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
