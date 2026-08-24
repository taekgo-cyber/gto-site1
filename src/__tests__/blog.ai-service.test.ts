import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  categoryFindUnique: vi.fn(),
  categoryFindFirst: vi.fn(),
  articleCreate: vi.fn(),
  articleFindUnique: vi.fn(),
  articleFindFirst: vi.fn(),
  tonnageFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    blogCategory: { findUnique: mocks.categoryFindUnique, findFirst: mocks.categoryFindFirst },
    blogArticle: { create: mocks.articleCreate, findUnique: mocks.articleFindUnique, findFirst: mocks.articleFindFirst },
    tonnage: { findMany: mocks.tonnageFindMany },
  },
}));

import { generateAiBlogDraft } from "@/lib/blog/ai/service";
import type { AiBlogProvider } from "@/lib/blog/ai/types";

describe("S18 AI generation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE", deletedAt: null });
    mocks.tonnageFindMany.mockResolvedValue([{ id: "ton-1", code: "5T", name: "5톤", weightKg: 5000 }]);
    mocks.articleFindUnique.mockResolvedValue(null);
    mocks.articleFindFirst.mockResolvedValue(null);
    mocks.categoryFindFirst.mockResolvedValue({ id: "cat-1" });
    mocks.categoryFindUnique.mockResolvedValue({ id: "cat-1", isActive: true });
    mocks.articleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "article-ai", slug: data.slug, status: data.status }));
  });

  it("accepts a fake provider boundary and stores generated output only as AI DRAFT", async () => {
    const provider: AiBlogProvider = {
      provider: "fake",
      model: "fake-v1",
      async generate() {
        return {
          title: "5톤 화물차 준비 가이드",
          slug: "5ton-cargo-guide",
          excerpt: "5톤 화물차 준비사항을 안내합니다.",
          contentMarkdown: "# 5톤 화물차 준비\n\n" + "사이트의 톤수 데이터를 바탕으로 준비사항을 차근차근 확인합니다. ".repeat(12) + "기준중량은 5000kg입니다.",
          seoTitle: "5톤 화물차 준비 가이드",
          seoDescription: "5톤 화물차 준비사항 안내",
          suggestedCategorySlug: "cargo-guides",
          tags: ["5톤", "화물차"],
        };
      },
    };

    const result = await generateAiBlogDraft({
      actorUserId: "admin-1",
      provider,
      now: new Date("2026-08-24T00:00:00.000Z"),
      request: { topic: "5톤 화물차 준비", targetKeyword: "5ton-cargo-guide", sourceType: "TONNAGE", sourceIds: ["ton-1"] },
    });

    expect(result.article.status).toBe("DRAFT");
    expect(mocks.articleCreate).toHaveBeenCalledTimes(1);
    const data = mocks.articleCreate.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      status: "DRAFT",
      publishedAt: null,
      contentOrigin: "AI",
      authorId: "admin-1",
      categoryId: "cat-1",
    }));
    expect(data.aiGenerationMeta).toEqual(expect.objectContaining({ provider: "fake", model: "fake-v1", sourceType: "TONNAGE", sourceIds: ["ton-1"] }));
  });

  it("rejects generation before persistence when quality guard has blocking PII", async () => {
    const provider: AiBlogProvider = {
      provider: "fake",
      model: "fake-v1",
      async generate() {
        return {
          title: "개인 연락처 포함",
          slug: "private-contact-post",
          excerpt: "검사",
          contentMarkdown: "담당자: 홍길동, 010-1234-5678, test@example.com",
          seoTitle: null,
          seoDescription: null,
          suggestedCategorySlug: null,
          tags: [],
        };
      },
    };

    await expect(generateAiBlogDraft({
      actorUserId: "admin-1",
      provider,
      request: { topic: "개인정보 검사", targetKeyword: "privacy-check", sourceType: "TONNAGE", sourceIds: ["ton-1"] },
    })).rejects.toThrow("BLOG_AI_QUALITY_FAILED");
    expect(mocks.articleCreate).not.toHaveBeenCalled();
  });

  it("still relies on canonical Blog service for DB-backed ACTIVE ADMIN authorization", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", role: "USER", status: "ACTIVE", deletedAt: null });
    const generate = vi.fn(async () => ({ title: "권한 검사", slug: "admin-check", excerpt: "", contentMarkdown: "본문 ".repeat(100), seoTitle: null, seoDescription: null, suggestedCategorySlug: null, tags: [] }));
    const provider: AiBlogProvider = { provider: "fake", model: "fake", generate };
    await expect(generateAiBlogDraft({ actorUserId: "user-1", provider, request: { topic: "권한 검사", targetKeyword: "admin-check", sourceType: "TONNAGE", sourceIds: ["ton-1"] } })).rejects.toThrow("ADMIN_REQUIRED");
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.tonnageFindMany).not.toHaveBeenCalled();
    expect(mocks.articleCreate).not.toHaveBeenCalled();
  });

  it("validates every provider implementation at the service boundary", async () => {
    const provider: AiBlogProvider = {
      provider: "broken-fake",
      model: "broken-v1",
      async generate() {
        return { title: "필드가 부족한 응답" } as never;
      },
    };

    await expect(generateAiBlogDraft({
      actorUserId: "admin-1",
      provider,
      request: { topic: "응답 검증", targetKeyword: "schema-check", sourceType: "TONNAGE", sourceIds: ["ton-1"] },
    })).rejects.toThrow("BLOG_AI_PROVIDER_SCHEMA_INVALID");
    expect(mocks.articleCreate).not.toHaveBeenCalled();
  });
});
