-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'ACTIVITY', 'CONTENT');

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "activityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "in_app_notifications_userId_dedupeKey_key"
ON "in_app_notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "in_app_notifications_userId_readAt_createdAt_idx"
ON "in_app_notifications"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "in_app_notifications_expiresAt_idx"
ON "in_app_notifications"("expiresAt");

-- AddForeignKey
ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications"
ADD CONSTRAINT "in_app_notifications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
