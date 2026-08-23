ALTER TABLE "blog_articles"
ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "featuredImageUrl" TEXT,
ADD COLUMN "featuredImageAlt" TEXT;
