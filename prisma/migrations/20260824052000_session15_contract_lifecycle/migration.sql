ALTER TABLE "company_recruitment_entitlements"
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelReason" TEXT;

CREATE INDEX "company_recruitment_entitlements_companyId_cancelledAt_validFrom_expiresAt_idx"
ON "company_recruitment_entitlements"("companyId", "cancelledAt", "validFrom", "expiresAt");
