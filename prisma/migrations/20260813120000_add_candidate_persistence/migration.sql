-- CreateEnum
CREATE TYPE "CandidateValidationStatus" AS ENUM ('VALID', 'REVIEW_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CandidateReviewStatus" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "candidate_questions" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "rawHtmlSnippetId" TEXT,
    "category" TEXT NOT NULL,
    "classificationMethod" TEXT NOT NULL,
    "questionNumber" INTEGER,
    "questionText" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "normalizedAnswers" JSONB NOT NULL,
    "explanation" TEXT,
    "explanationReference" JSONB,
    "images" JSONB NOT NULL,
    "validationStatus" "CandidateValidationStatus" NOT NULL,
    "validationErrors" JSONB NOT NULL,
    "contentFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_reviews" (
    "id" TEXT NOT NULL,
    "candidateQuestionId" TEXT NOT NULL,
    "validationErrors" JSONB NOT NULL,
    "reviewStatus" "CandidateReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_duplicate_groups" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "masterCandidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_duplicate_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_duplicate_members" (
    "groupId" TEXT NOT NULL,
    "candidateQuestionId" TEXT NOT NULL,

    CONSTRAINT "candidate_duplicate_members_pkey" PRIMARY KEY ("groupId","candidateQuestionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_questions_sourceName_sourceQuestionId_key" ON "candidate_questions"("sourceName", "sourceQuestionId");

-- CreateIndex
CREATE INDEX "candidate_questions_contentFingerprint_idx" ON "candidate_questions"("contentFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_reviews_candidateQuestionId_key" ON "candidate_reviews"("candidateQuestionId");

-- CreateIndex
CREATE INDEX "candidate_reviews_reviewStatus_idx" ON "candidate_reviews"("reviewStatus");

-- CreateIndex
CREATE INDEX "candidate_duplicate_members_candidateQuestionId_idx" ON "candidate_duplicate_members"("candidateQuestionId");

-- AddForeignKey
ALTER TABLE "candidate_reviews" ADD CONSTRAINT "candidate_reviews_candidateQuestionId_fkey" FOREIGN KEY ("candidateQuestionId") REFERENCES "candidate_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_duplicate_members" ADD CONSTRAINT "candidate_duplicate_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "candidate_duplicate_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_duplicate_members" ADD CONSTRAINT "candidate_duplicate_members_candidateQuestionId_fkey" FOREIGN KEY ("candidateQuestionId") REFERENCES "candidate_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
