-- AlterTable
ALTER TABLE "candidate_questions" ADD COLUMN     "fetchedAt" TIMESTAMP(3),
ADD COLUMN     "originalUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "candidate_duplicate_groups_fingerprint_key" ON "candidate_duplicate_groups"("fingerprint");