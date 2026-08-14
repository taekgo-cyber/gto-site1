-- CreateEnum
CREATE TYPE "GeneratedQuestionStatus" AS ENUM ('GENERATED', 'QA_PENDING', 'QA_PASSED', 'QA_FAILED', 'HUMAN_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "generated_questions" (
    "id" TEXT NOT NULL,
    "candidateQuestionId" TEXT NOT NULL,
    "status" "GeneratedQuestionStatus" NOT NULL DEFAULT 'GENERATED',
    "questionText" TEXT,
    "choices" JSONB,
    "answers" JSONB,
    "explanation" TEXT,
    "category" TEXT,
    "difficulty" TEXT,
    "factSourceMapping" JSONB,
    "contentFingerprint" TEXT,
    "similarityScore" DOUBLE PRECISION,
    "similarityWarning" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "rawLlmResponse" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_question_qas" (
    "id" TEXT NOT NULL,
    "generatedQuestionId" TEXT NOT NULL,
    "evaluationScores" JSONB,
    "hasHallucination" BOOLEAN,
    "isCopyrightSafe" BOOLEAN,
    "criticalFlaws" JSONB,
    "qaFeedback" TEXT,
    "isPass" BOOLEAN,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "rawLlmResponse" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_question_qas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_questions" (
    "id" TEXT NOT NULL,
    "generatedQuestionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "explanation" TEXT,
    "difficulty" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_questions_candidateQuestionId_idx" ON "generated_questions"("candidateQuestionId");

-- CreateIndex
CREATE INDEX "generated_questions_status_idx" ON "generated_questions"("status");

-- CreateIndex
CREATE INDEX "generated_questions_contentFingerprint_idx" ON "generated_questions"("contentFingerprint");

-- CreateIndex
CREATE INDEX "generated_question_qas_generatedQuestionId_idx" ON "generated_question_qas"("generatedQuestionId");

-- CreateIndex
CREATE INDEX "generated_question_qas_isPass_idx" ON "generated_question_qas"("isPass");

-- CreateIndex
CREATE UNIQUE INDEX "master_questions_generatedQuestionId_key" ON "master_questions"("generatedQuestionId");

-- CreateIndex
CREATE INDEX "master_questions_isActive_idx" ON "master_questions"("isActive");

-- CreateIndex
CREATE INDEX "master_questions_category_idx" ON "master_questions"("category");

-- AddForeignKey
ALTER TABLE "generated_questions" ADD CONSTRAINT "generated_questions_candidateQuestionId_fkey" FOREIGN KEY ("candidateQuestionId") REFERENCES "candidate_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_question_qas" ADD CONSTRAINT "generated_question_qas_generatedQuestionId_fkey" FOREIGN KEY ("generatedQuestionId") REFERENCES "generated_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_questions" ADD CONSTRAINT "master_questions_generatedQuestionId_fkey" FOREIGN KEY ("generatedQuestionId") REFERENCES "generated_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
