-- CreateTable
CREATE TABLE "cbt_question_activities" (
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "lastIsCorrect" BOOLEAN,
    "lastSelectedOption" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cbt_question_activities_pkey" PRIMARY KEY ("userId","questionId")
);

-- CreateTable
CREATE TABLE "cbt_exam_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "durationSeconds" INTEGER,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cbt_exam_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cbt_question_activities_userId_bookmarked_idx" ON "cbt_question_activities"("userId", "bookmarked");

-- CreateIndex
CREATE INDEX "cbt_question_activities_userId_lastIsCorrect_idx" ON "cbt_question_activities"("userId", "lastIsCorrect");

-- CreateIndex
CREATE INDEX "cbt_exam_records_userId_createdAt_idx" ON "cbt_exam_records"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "cbt_question_activities" ADD CONSTRAINT "cbt_question_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_question_activities" ADD CONSTRAINT "cbt_question_activities_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "cbt_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_exam_records" ADD CONSTRAINT "cbt_exam_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_exam_records" ADD CONSTRAINT "cbt_exam_records_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cbt_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
