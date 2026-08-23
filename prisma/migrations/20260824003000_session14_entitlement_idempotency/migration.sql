-- Session 14: bounded idempotency key for advertisement entitlement grants.
-- Nullable preserves historical entitlement rows that predate this grant boundary.
ALTER TABLE "company_recruitment_entitlements" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "company_recruitment_entitlements_idempotencyKey_key"
ON "company_recruitment_entitlements"("idempotencyKey");