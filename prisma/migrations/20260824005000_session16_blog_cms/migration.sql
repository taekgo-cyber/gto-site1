CREATE TYPE "BlogArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "blog_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blog_articles" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "authorId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "contentMarkdown" TEXT NOT NULL,
    "status" "BlogArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blog_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");
CREATE INDEX "blog_categories_isActive_sortOrder_idx" ON "blog_categories"("isActive", "sortOrder");
CREATE UNIQUE INDEX "blog_articles_slug_key" ON "blog_articles"("slug");
CREATE INDEX "blog_articles_status_publishedAt_idx" ON "blog_articles"("status", "publishedAt" DESC);
CREATE INDEX "blog_articles_categoryId_status_publishedAt_idx" ON "blog_articles"("categoryId", "status", "publishedAt" DESC);
CREATE INDEX "blog_articles_authorId_idx" ON "blog_articles"("authorId");

ALTER TABLE "blog_articles"
ADD CONSTRAINT "blog_articles_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "blog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blog_articles"
ADD CONSTRAINT "blog_articles_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;