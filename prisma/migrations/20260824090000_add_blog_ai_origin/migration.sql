CREATE TYPE "BlogContentOrigin" AS ENUM ('MANUAL', 'AI');

ALTER TABLE "blog_articles"
ADD COLUMN "contentOrigin" "BlogContentOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "aiGenerationMeta" JSONB;
