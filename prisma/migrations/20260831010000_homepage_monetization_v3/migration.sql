-- Homepage Monetization V3: canonical product/placement/target contract.
-- All additions are nullable or additive so legacy HOME_TOP rows remain readable.
CREATE TYPE "AdvertisementProductType" AS ENUM ('RECRUITMENT_LISTING', 'COMPANY_BANNER');

ALTER TABLE "products"
ADD COLUMN "advertisementType" "AdvertisementProductType";

ALTER TABLE "ad_campaigns"
ADD COLUMN "advertisementType" "AdvertisementProductType",
ADD COLUMN "jobPostId" TEXT,
ADD COLUMN "leasePostId" TEXT,
ADD COLUMN "bannerCopy" TEXT;

-- New V3 campaigns must be a typed recruitment XOR target or a targetless banner.
-- NULL advertisementType is the explicit compatibility boundary for legacy rows.
ALTER TABLE "ad_campaigns"
ADD CONSTRAINT "ad_campaigns_v3_target_contract_check"
CHECK (
  "advertisementType" IS NULL
  OR (
    "advertisementType" = 'RECRUITMENT_LISTING'
    AND (("jobPostId" IS NOT NULL)::int + ("leasePostId" IS NOT NULL)::int) = 1
  )
  OR (
    "advertisementType" = 'COMPANY_BANNER'
    AND "jobPostId" IS NULL
    AND "leasePostId" IS NULL
  )
);

ALTER TABLE "ad_campaigns"
ADD CONSTRAINT "ad_campaigns_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ad_campaigns"
ADD CONSTRAINT "ad_campaigns_leasePostId_fkey"
FOREIGN KEY ("leasePostId") REFERENCES "lease_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ad_campaigns_jobPostId_idx" ON "ad_campaigns"("jobPostId");
CREATE INDEX "ad_campaigns_leasePostId_idx" ON "ad_campaigns"("leasePostId");
CREATE INDEX "ad_campaigns_advertisementType_status_idx" ON "ad_campaigns"("advertisementType", "status");

CREATE TABLE "company_advertisement_entitlements" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "source" TEXT NOT NULL,
  "sourceReference" TEXT,
  "idempotencyKey" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_advertisement_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_advertisement_entitlements_idempotencyKey_key"
ON "company_advertisement_entitlements"("idempotencyKey");
CREATE INDEX "company_ad_entitlements_eligibility_idx"
ON "company_advertisement_entitlements"("companyId", "productId", "cancelledAt", "validFrom", "expiresAt");
CREATE INDEX "company_ad_entitlements_product_idx"
ON "company_advertisement_entitlements"("productId", "cancelledAt", "validFrom", "expiresAt");

ALTER TABLE "company_advertisement_entitlements"
ADD CONSTRAINT "company_advertisement_entitlements_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_advertisement_entitlements"
ADD CONSTRAINT "company_advertisement_entitlements_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Managed legacy listing products become explicit V3 recruitment products.
UPDATE "products"
SET "advertisementType" = 'RECRUITMENT_LISTING'
WHERE "code" IN ('AD_GENERAL_7D', 'AD_PREMIUM_7D', 'AD_MAIN_7D')
  AND "advertisementType" IS NULL;

-- Safe, idempotent recovery path from historical advertisement grants.
INSERT INTO "company_advertisement_entitlements" (
  "id", "companyId", "productId", "validFrom", "expiresAt", "source",
  "sourceReference", "idempotencyKey", "cancelledAt", "cancelReason", "createdAt", "updatedAt"
)
SELECT
  'ad-v3-' || cre."id",
  cre."companyId",
  pre."productId",
  cre."validFrom",
  cre."expiresAt",
  'LEGACY_RECRUITMENT_ENTITLEMENT_BACKFILL',
  cre."id",
  'ad-v3-backfill:' || cre."id",
  cre."cancelledAt",
  cre."cancelReason",
  cre."createdAt",
  CURRENT_TIMESTAMP
FROM "company_recruitment_entitlements" cre
JOIN "product_recruitment_entitlements" pre ON pre."id" = cre."productEntitlementId"
JOIN "products" p ON p."id" = pre."productId"
WHERE p."type" = 'ADVERTISEMENT'
ON CONFLICT ("idempotencyKey") DO NOTHING;

INSERT INTO "ad_placements" ("id", "code", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('homepage-recruitment-v3', 'HOME_RECRUITMENT', '홈 채용·지입 광고', 'MAIN/PREMIUM/GENERAL 중앙 광고', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('homepage-company-left-v3', 'HOME_COMPANY_LEFT', '홈 왼쪽 기업 배너', '데스크톱 왼쪽 기업 배너', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('homepage-company-right-v3', 'HOME_COMPANY_RIGHT', '홈 오른쪽 기업 배너', '데스크톱 오른쪽 기업 배너', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;
