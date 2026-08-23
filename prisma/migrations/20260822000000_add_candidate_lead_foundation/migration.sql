-- CreateEnum
CREATE TYPE "CandidateLeadStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeadCloseReason" AS ENUM ('HIRED', 'USER_CLOSED', 'ADMIN_CLOSED');

-- CreateEnum
CREATE TYPE "LeadMatchStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "candidate_leads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CandidateLeadStatus" NOT NULL DEFAULT 'DRAFT',
    "preferredRegionId" TEXT,
    "vehicleTypeId" TEXT,
    "tonnageId" TEXT,
    "experienceYears" INTEGER,
    "leaseExperience" BOOLEAN,
    "vehicleOwned" BOOLEAN,
    "licenseInfo" TEXT,
    "desiredWorkType" "WorkType",
    "desiredIncomeMin" INTEGER,
    "desiredIncomeMax" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "careerSummary" TEXT,
    "consentVersion" TEXT,
    "consentedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" "LeadCloseReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_matches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" "LeadMatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_contact_unlocks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entitlementSource" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_contact_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_leads_userId_status_idx" ON "candidate_leads"("userId", "status");

-- CreateIndex
CREATE INDEX "candidate_leads_status_expiresAt_idx" ON "candidate_leads"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "candidate_leads_preferredRegionId_idx" ON "candidate_leads"("preferredRegionId");

-- CreateIndex
CREATE INDEX "candidate_leads_vehicleTypeId_idx" ON "candidate_leads"("vehicleTypeId");

-- CreateIndex
CREATE INDEX "candidate_leads_tonnageId_idx" ON "candidate_leads"("tonnageId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_matches_companyId_leadId_key" ON "lead_matches"("companyId", "leadId");

-- CreateIndex
CREATE INDEX "lead_matches_companyId_status_idx" ON "lead_matches"("companyId", "status");

-- CreateIndex
CREATE INDEX "lead_matches_leadId_idx" ON "lead_matches"("leadId");

-- CreateIndex
CREATE INDEX "lead_matches_actorUserId_idx" ON "lead_matches"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_contact_unlocks_companyId_leadId_key" ON "lead_contact_unlocks"("companyId", "leadId");

-- CreateIndex
CREATE INDEX "lead_contact_unlocks_companyId_idx" ON "lead_contact_unlocks"("companyId");

-- CreateIndex
CREATE INDEX "lead_contact_unlocks_leadId_idx" ON "lead_contact_unlocks"("leadId");

-- CreateIndex
CREATE INDEX "lead_contact_unlocks_actorUserId_idx" ON "lead_contact_unlocks"("actorUserId");

-- Partial unique: at most one non-terminal Lead per user (DRAFT/ACTIVE/PAUSED)
CREATE UNIQUE INDEX "candidate_leads_userId_non_terminal_unique" ON "candidate_leads"("userId") WHERE "status" IN ('DRAFT', 'ACTIVE', 'PAUSED');

-- AddForeignKey
ALTER TABLE "candidate_leads" ADD CONSTRAINT "candidate_leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_leads" ADD CONSTRAINT "candidate_leads_preferredRegionId_fkey" FOREIGN KEY ("preferredRegionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_leads" ADD CONSTRAINT "candidate_leads_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_leads" ADD CONSTRAINT "candidate_leads_tonnageId_fkey" FOREIGN KEY ("tonnageId") REFERENCES "tonnages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_matches" ADD CONSTRAINT "lead_matches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_matches" ADD CONSTRAINT "lead_matches_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "candidate_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_matches" ADD CONSTRAINT "lead_matches_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_contact_unlocks" ADD CONSTRAINT "lead_contact_unlocks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_contact_unlocks" ADD CONSTRAINT "lead_contact_unlocks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "candidate_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_contact_unlocks" ADD CONSTRAINT "lead_contact_unlocks_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
