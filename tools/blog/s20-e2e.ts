import { prisma } from "@/lib/prisma";
import { enqueueBlogContentJob, processDueBlogContentJobs } from "@/lib/blog/automation";
import { getPublishedBlogArticleBySlug } from "@/lib/blog/dal";
import type { AiBlogProvider } from "@/lib/blog/ai/types";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !decodeURIComponent(new URL(connectionString).pathname).includes("gto_s20_")) {
    throw new Error("S20_E2E_DISPOSABLE_DATABASE_REQUIRED");
  }
  const now = new Date("2026-08-24T12:00:00.000Z");
  const admin = await prisma.user.create({ data: { email: "s20-admin@example.invalid", passwordHash: "not-a-real-password", name: "S20 Admin", role: "ADMIN", status: "ACTIVE" } });
  const tonnage = await prisma.tonnage.create({ data: { code: "S20-5T", name: "5톤", weightKg: 5000, isActive: true } });
  const job = await enqueueBlogContentJob({
    actorUserId: admin.id,
    idempotencyKey: "s20:e2e:job:0001",
    scheduledFor: now,
    now,
    request: { topic: "5톤 화물차 준비", targetKeyword: "s20-5ton-guide", sourceType: "TONNAGE", sourceIds: [tonnage.id] },
  });
  let providerCalls = 0;
  const provider: AiBlogProvider = {
    provider: "fake",
    model: "s20-e2e",
    async generate() {
      providerCalls += 1;
      return {
        title: "5톤 화물차 준비 가이드",
        slug: "s20-5ton-guide",
        excerpt: "공개된 톤수 데이터를 바탕으로 준비사항을 안내합니다.",
        contentMarkdown: "# 5톤 화물차 준비\n\n" + "사이트의 공개 톤수 데이터를 바탕으로 준비사항을 차근차근 확인합니다. ".repeat(14) + "기준중량은 5000kg입니다.",
        seoTitle: "5톤 화물차 준비 가이드",
        seoDescription: "공개 데이터 기반 5톤 화물차 준비 안내",
        suggestedCategorySlug: null,
        tags: ["5톤", "화물차"],
      };
    },
  };
  const first = await processDueBlogContentJobs({ runnerId: "s20-e2e:first", now, provider, batchSize: 1 });
  const article = await prisma.blogArticle.findUniqueOrThrow({ where: { automationJobId: job.id } });
  const publicArticle = await getPublishedBlogArticleBySlug(article.slug, now);
  if (first.succeeded !== 1 || article.status !== "DRAFT" || article.publishedAt !== null || publicArticle !== null) {
    throw new Error("S20_E2E_DRAFT_BOUNDARY_FAILED");
  }

  await prisma.blogContentJob.update({ where: { id: job.id }, data: { status: "QUEUED", scheduledFor: now, completedAt: null } });
  const replay = await processDueBlogContentJobs({ runnerId: "s20-e2e:replay", now, provider, batchSize: 1 });
  const articleCount = await prisma.blogArticle.count({ where: { automationJobId: job.id } });
  if (replay.succeeded !== 1 || providerCalls !== 1 || articleCount !== 1) throw new Error("S20_E2E_IDEMPOTENCY_FAILED");

  console.log(JSON.stringify({ migrations: "ready", first, replay, providerCalls, articleCount, articleStatus: article.status, publishedAt: article.publishedAt }));
}

main().finally(async () => prisma.$disconnect());
