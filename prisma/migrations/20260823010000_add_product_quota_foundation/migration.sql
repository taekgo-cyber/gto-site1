-- Session 13 Gate 4: Product/Quota foundation only.
-- No purchase, payment, credit grant, Lead, or shared DB application is included.

CREATE TYPE "CreditPackageStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "RecruitmentTier" AS ENUM ('GENERAL', 'PREMIUM', 'MAIN');

CREATE TYPE "QuotaAllowanceType" AS ENUM ('MATCH', 'CONTACT_UNLOCK');

CREATE TABLE "credit_packages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "priceKrw" INTEGER NOT NULL,
    "creditAmount" INTEGER NOT NULL,
    "status" "CreditPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_recruitment_entitlements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recruitmentTier" "RecruitmentTier" NOT NULL,
    "weeklyMatchQuota" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_recruitment_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_recruitment_entitlements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productEntitlementId" TEXT,
    "recruitmentTier" "RecruitmentTier" NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_recruitment_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_quota_usages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "allowanceType" "QuotaAllowanceType" NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "consumedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_quota_usages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_quota_consumptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quotaUsageId" TEXT NOT NULL,
    "allowanceType" "QuotaAllowanceType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationReference" TEXT,
    "consumedCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_quota_consumptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_packages_code_key" ON "credit_packages"("code");
CREATE INDEX "credit_packages_status_idx" ON "credit_packages"("status");
CREATE UNIQUE INDEX "product_recruitment_entitlements_productId_key" ON "product_recruitment_entitlements"("productId");
CREATE INDEX "company_recruitment_entitlements_companyId_validFrom_expiresAt_idx" ON "company_recruitment_entitlements"("companyId", "validFrom", "expiresAt");
CREATE INDEX "company_recruitment_entitlements_companyId_recruitmentTier_idx" ON "company_recruitment_entitlements"("companyId", "recruitmentTier");
CREATE UNIQUE INDEX "company_quota_usages_companyId_allowanceType_windowStart_key" ON "company_quota_usages"("companyId", "allowanceType", "windowStart");
CREATE INDEX "company_quota_usages_companyId_windowStart_windowEnd_idx" ON "company_quota_usages"("companyId", "windowStart", "windowEnd");
CREATE UNIQUE INDEX "company_quota_consumptions_companyId_idempotencyKey_key" ON "company_quota_consumptions"("companyId", "idempotencyKey");
CREATE INDEX "company_quota_consumptions_quotaUsageId_createdAt_idx" ON "company_quota_consumptions"("quotaUsageId", "createdAt" DESC);
CREATE INDEX "company_quota_consumptions_companyId_allowanceType_idx" ON "company_quota_consumptions"("companyId", "allowanceType");

ALTER TABLE "product_recruitment_entitlements" ADD CONSTRAINT "product_recruitment_entitlements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_recruitment_entitlements" ADD CONSTRAINT "company_recruitment_entitlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_recruitment_entitlements" ADD CONSTRAINT "company_recruitment_entitlements_productEntitlementId_fkey" FOREIGN KEY ("productEntitlementId") REFERENCES "product_recruitment_entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_quota_usages" ADD CONSTRAINT "company_quota_usages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_quota_consumptions" ADD CONSTRAINT "company_quota_consumptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_quota_consumptions" ADD CONSTRAINT "company_quota_consumptions_quotaUsageId_fkey" FOREIGN KEY ("quotaUsageId") REFERENCES "company_quota_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
