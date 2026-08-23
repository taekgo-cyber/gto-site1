-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('GRANT', 'CONSUME', 'ADJUSTMENT', 'EXPIRE');

-- CreateEnum
CREATE TYPE "CreditAllowanceType" AS ENUM ('MATCH', 'CONTACT_UNLOCK');

-- CreateTable
CREATE TABLE "credit_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_grants" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "allowanceType" "CreditAllowanceType" NOT NULL,
    "source" TEXT NOT NULL,
    "referenceId" TEXT,
    "amount" INTEGER NOT NULL,
    "remainingAmount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "CreditTransactionType" NOT NULL,
    "allowanceType" "CreditAllowanceType",
    "amountDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "source" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_accounts_companyId_key" ON "credit_accounts"("companyId");

-- CreateIndex
CREATE INDEX "credit_accounts_companyId_idx" ON "credit_accounts"("companyId");

-- CreateIndex
CREATE INDEX "credit_grants_companyId_allowanceType_idx" ON "credit_grants"("companyId", "allowanceType");

-- CreateIndex
CREATE INDEX "credit_grants_creditAccountId_idx" ON "credit_grants"("creditAccountId");

-- CreateIndex
CREATE INDEX "credit_grants_expiresAt_idx" ON "credit_grants"("expiresAt");

-- CreateIndex
CREATE INDEX "credit_grants_companyId_expiresAt_idx" ON "credit_grants"("companyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_companyId_idempotencyKey_key" ON "credit_transactions"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_transactions_creditAccountId_createdAt_idx" ON "credit_transactions"("creditAccountId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "credit_transactions_companyId_type_idx" ON "credit_transactions"("companyId", "type");

-- CreateIndex
CREATE INDEX "credit_transactions_actorUserId_idx" ON "credit_transactions"("actorUserId");

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "credit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "credit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
