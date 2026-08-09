-- CreateEnum
CREATE TYPE "LeasePostType" AS ENUM ('HIRE', 'SEEK');

-- CreateEnum
CREATE TYPE "LeasePostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "AttachmentMediaType" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateTable
CREATE TABLE "lease_posts" (
    "id" TEXT NOT NULL,
    "type" "LeasePostType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "LeasePostStatus" NOT NULL DEFAULT 'DRAFT',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "companyId" TEXT,
    "regionId" TEXT,
    "vehicleTypeId" TEXT,
    "tonnageId" TEXT,
    "payType" "PayType",
    "payAmount" INTEGER,
    "workType" "WorkType",
    "conditions" JSONB,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_post_attachments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mediaType" "AttachmentMediaType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRepresentative" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_post_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lease_posts_status_type_publishedAt_idx" ON "lease_posts"("status", "type", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "lease_posts_authorId_idx" ON "lease_posts"("authorId");

-- CreateIndex
CREATE INDEX "lease_posts_regionId_idx" ON "lease_posts"("regionId");

-- CreateIndex
CREATE INDEX "lease_posts_vehicleTypeId_idx" ON "lease_posts"("vehicleTypeId");

-- CreateIndex
CREATE INDEX "lease_posts_tonnageId_idx" ON "lease_posts"("tonnageId");

-- CreateIndex
CREATE INDEX "lease_post_attachments_postId_deletedAt_sortOrder_idx" ON "lease_post_attachments"("postId", "deletedAt", "sortOrder");

-- AddForeignKey
ALTER TABLE "lease_posts" ADD CONSTRAINT "lease_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_posts" ADD CONSTRAINT "lease_posts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_posts" ADD CONSTRAINT "lease_posts_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_posts" ADD CONSTRAINT "lease_posts_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_posts" ADD CONSTRAINT "lease_posts_tonnageId_fkey" FOREIGN KEY ("tonnageId") REFERENCES "tonnages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_post_attachments" ADD CONSTRAINT "lease_post_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "lease_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
