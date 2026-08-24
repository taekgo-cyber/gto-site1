CREATE TYPE "BlogContentJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "BlogContentAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "blog_articles" ADD COLUMN "automationJobId" TEXT;

CREATE TABLE "blog_content_jobs" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT,
    "topic" TEXT NOT NULL,
    "targetKeyword" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceIds" JSONB NOT NULL DEFAULT '[]',
    "instruction" TEXT,
    "topicKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "BlogContentJobStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blog_content_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blog_content_job_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "BlogContentAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "runnerId" TEXT NOT NULL,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "blog_content_job_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blog_automation_controls" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blog_automation_controls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_articles_automationJobId_key" ON "blog_articles"("automationJobId");
CREATE UNIQUE INDEX "blog_content_jobs_topicKey_key" ON "blog_content_jobs"("topicKey");
CREATE UNIQUE INDEX "blog_content_jobs_idempotencyKey_key" ON "blog_content_jobs"("idempotencyKey");
CREATE INDEX "blog_content_jobs_status_scheduledFor_idx" ON "blog_content_jobs"("status", "scheduledFor");
CREATE INDEX "blog_content_jobs_requestedById_createdAt_idx" ON "blog_content_jobs"("requestedById", "createdAt" DESC);
CREATE UNIQUE INDEX "blog_content_job_attempts_jobId_attemptNumber_key" ON "blog_content_job_attempts"("jobId", "attemptNumber");
CREATE INDEX "blog_content_job_attempts_status_startedAt_idx" ON "blog_content_job_attempts"("status", "startedAt");

ALTER TABLE "blog_articles" ADD CONSTRAINT "blog_articles_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "blog_content_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "blog_content_jobs" ADD CONSTRAINT "blog_content_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "blog_content_job_attempts" ADD CONSTRAINT "blog_content_job_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "blog_content_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blog_automation_controls" ADD CONSTRAINT "blog_automation_controls_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
