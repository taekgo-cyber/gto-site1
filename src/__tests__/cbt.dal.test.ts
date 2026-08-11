import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cbtCategory: { findMany: vi.fn(), findUnique: vi.fn() },
    cbtQuestion: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getCbtCategories,
  getPublicQuestionsByCategorySlug,
} from "@/lib/cbt/dal";

const PUBLIC_SELECT_KEYS = ["id", "subject", "questionText", "options", "imageUrl"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicQuestionsByCategorySlug (보안)", () => {
  it("DB select에 correctOption과 explanation이 포함되지 않는다", async () => {
    vi.mocked(prisma.cbtQuestion.findMany).mockResolvedValue([]);

    await getPublicQuestionsByCategorySlug("cargo-driver");

    const select = vi.mocked(prisma.cbtQuestion.findMany).mock.calls[0][0]?.select;
    expect(select).toBeDefined();
    expect(Object.keys(select as Record<string, unknown>)).toEqual(
      expect.arrayContaining(PUBLIC_SELECT_KEYS),
    );
    expect(select).not.toHaveProperty("correctOption");
    expect(select).not.toHaveProperty("explanation");
  });

  it("반환 object의 key에 correctOption과 explanation이 없다", async () => {
    vi.mocked(prisma.cbtQuestion.findMany).mockResolvedValue([
      {
        id: "q-1",
        subject: "교통법규",
        questionText: "문제",
        options: [{ id: 1, text: "보기 1" }],
        imageUrl: null,
      },
    ] as never);

    const questions = await getPublicQuestionsByCategorySlug("cargo-driver");

    expect(questions).toHaveLength(1);
    expect(Object.keys(questions[0])).not.toContain("correctOption");
    expect(Object.keys(questions[0])).not.toContain("explanation");
  });

  it("PUBLISHED 상태의 문제만 조회한다", async () => {
    vi.mocked(prisma.cbtQuestion.findMany).mockResolvedValue([]);

    await getPublicQuestionsByCategorySlug("cargo-driver");

    const where = vi.mocked(prisma.cbtQuestion.findMany).mock.calls[0][0]?.where;
    expect(where).toEqual({
      category: { slug: "cargo-driver", isActive: true },
      status: "PUBLISHED",
    });
  });
});

describe("getCbtCategories", () => {
  it("isActive 카테고리만 조회한다", async () => {
    vi.mocked(prisma.cbtCategory.findMany).mockResolvedValue([]);

    await getCbtCategories();

    const where = vi.mocked(prisma.cbtCategory.findMany).mock.calls[0][0]?.where;
    expect(where).toEqual({ isActive: true });
  });

  it("PUBLISHED 문제가 없는 카테고리는 제외한다", async () => {
    vi.mocked(prisma.cbtCategory.findMany).mockResolvedValue([
      {
        id: "c-1",
        slug: "cargo-driver",
        name: "화물운송종사자격시험",
        description: null,
        _count: { questions: 0 },
      },
      {
        id: "c-2",
        slug: "empty",
        name: "빈 시험",
        description: null,
        _count: { questions: 5 },
      },
    ] as never);

    const categories = await getCbtCategories();

    expect(categories).toHaveLength(1);
    expect(categories[0].slug).toBe("empty");
    expect(categories[0].questionCount).toBe(5);
  });
});
