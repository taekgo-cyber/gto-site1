import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  articleFindMany: vi.fn(),
  categoryFindMany: vi.fn(),
  jobCount: vi.fn(),
  leaseCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    blogArticle: { findMany: mocks.articleFindMany },
    cbtCategory: { findMany: mocks.categoryFindMany },
    jobPost: { count: mocks.jobCount },
    leasePost: { count: mocks.leaseCount },
  },
}));

import { chooseCbtCategoryLink, getBlogArticleDiscovery, rankRelatedBlogArticles, type BlogDiscoveryArticle } from "@/lib/blog/discovery";

const publishedAt = new Date("2026-08-24T00:00:00.000Z");
function article(input: Partial<BlogDiscoveryArticle> & Pick<BlogDiscoveryArticle, "id" | "slug" | "title">): BlogDiscoveryArticle {
  return { excerpt: null, tags: [], category: null, publishedAt, ...input };
}

function category(slug: string): { slug: string; name: string } {
  return { slug, name: slug };
}

function makeAllServicesAvailable() {
  mocks.categoryFindMany.mockResolvedValue([{ slug: "safety", name: "안전관리", description: null }]);
  mocks.jobCount.mockResolvedValue(2);
  mocks.leaseCount.mockResolvedValue(1);
}

describe("Blog S19 discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.articleFindMany.mockResolvedValue([]);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.jobCount.mockResolvedValue(0);
    mocks.leaseCount.mockResolvedValue(0);
  });

  it("ranks same-category and shared-tag articles without linking the current article", () => {
    const current = article({ id: "current", slug: "current", title: "5톤 지입 준비", tags: ["5톤"], category: { slug: "guide", name: "가이드" } });
    const ranked = rankRelatedBlogArticles(current, [
      current,
      article({ id: "other", slug: "other", title: "운송 정보", category: { slug: "news", name: "뉴스" } }),
      article({ id: "best", slug: "best", title: "5톤 체크리스트", tags: ["5톤"], category: { slug: "guide", name: "가이드" } }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["best", "other"]);
  });

  it("returns only an authoritative CBT category and falls back to no category match", () => {
    const current = article({ id: "current", slug: "current", title: "화물 자격 시험 준비", tags: ["안전관리"] });
    const categories = [
      { slug: "cargo-law", name: "화물운송 법규", description: null },
      { slug: "safety", name: "안전관리", description: "안전관리 시험" },
    ];
    expect(chooseCbtCategoryLink(current, categories)).toEqual(categories[1]);
    expect(chooseCbtCategoryLink(article({ id: "x", slug: "x", title: "완전히 다른 글" }), categories)).toBeNull();
  });

  it("omits phantom service links and queries only publicly visible source records", async () => {
    const current = article({ id: "current", slug: "current", title: "화물 정보" });
    const result = await getBlogArticleDiscovery(current, publishedAt);
    expect(result.serviceLinks).toEqual([]);
    expect(mocks.categoryFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, questions: { some: { status: "PUBLISHED" } } },
    }));
    expect(mocks.jobCount).toHaveBeenCalledWith({ where: { status: "OPEN", deletedAt: null, publishedAt: { lte: publishedAt, not: null } } });
    expect(mocks.leaseCount).toHaveBeenCalledWith({ where: { status: "PUBLISHED", deletedAt: null, publishedAt: { lte: publishedAt, not: null } } });
  });

  it("returns only the canonical CBT root link when every service is available", async () => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: "current",
      slug: "current",
      title: "안전관리 준비",
      category: category("cargo-driver-cbt"),
    }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual(["/cbt"]);
  });

  it.each([
    ["jobs", "/jobs"],
    ["lease", "/lease"],
  ])("uses the exact %s category before conflicting tags or title", async (categorySlug, expectedHref) => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: `current-${categorySlug}`,
      slug: `current-${categorySlug}`,
      title: "CBT 지입 계약",
      tags: ["CBT", "지입차"],
      category: category(categorySlug),
    }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual([expectedHref]);
  });

  it.each([
    ["cargo-driver-cbt", "CBT 입문", [], "cbt"],
    ["jobs", "화물차 일자리", [], "jobs"],
    ["lease", "지입차 입문", [], "lease"],
  ])("omits %s CTA when only unrelated services are available", async (categorySlug, title, tags, unavailableKind) => {
    makeAllServicesAvailable();
    if (unavailableKind === "cbt") mocks.categoryFindMany.mockResolvedValue([]);
    if (unavailableKind === "jobs") mocks.jobCount.mockResolvedValue(0);
    if (unavailableKind === "lease") mocks.leaseCount.mockResolvedValue(0);
    const result = await getBlogArticleDiscovery(article({
      id: `unavailable-${categorySlug}`,
      slug: `unavailable-${categorySlug}`,
      title,
      tags,
      category: category(categorySlug),
    }), publishedAt);
    expect(result.serviceLinks).toEqual([]);
  });

  it.each([
    ["1.4톤과 2.5톤 화물차 업무 비교 전 확인할 기준", ["1.4톤 화물차", "2.5톤 화물차", "화물차 업무", "톤수 비교"]],
    ["카고와 윙바디 화물차 차이와 업무 선택 기준", ["카고 화물차", "윙바디 화물차", "차량 종류", "화물차 업무"]],
  ])("resolves current cargo-practice job context to one Jobs CTA", async (title, tags) => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: title,
      slug: `cargo-practice-${tags.length}`,
      title,
      tags,
      category: category("cargo-practice"),
    }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual(["/jobs"]);
  });

  it.each([
    ["cargo-driver-cbt-study-order", "화물운송종사자격시험 CBT 처음 시작할 때 단계별 학습 순서", "cargo-driver-cbt", ["화물운송종사자격시험", "CBT", "CBT 학습순서", "자격시험 준비"], "/cbt"],
    ["cargo-driver-cbt-wrong-answer-review", "화물운송종사자격시험 CBT 오답노트 만드는 법과 복습 순서", "cargo-driver-cbt", ["화물운송종사자격시험", "CBT", "오답노트", "시험 복습"], "/cbt"],
    ["cargo-driver-exam-subject-study-guide", "화물운송종사자격시험 과목별 공부 순서와 CBT 활용법 - 처음 준비하는 사람을 위한 가이드", "cargo-driver-cbt", ["화물운송종사자격시험", "CBT", "과목별 공부", "자격시험"], "/cbt"],
    ["cargo-job-post-checklist", "화물차 일자리 공고 지원 전 확인해야 할 7가지 체크리스트", "jobs", ["화물차 일자리", "화물기사 구인", "구인공고", "취업 체크리스트"], "/jobs"],
    ["one-ton-cargo-job-beginner-guide", "1톤 화물차 일자리 초보자가 업무 조건을 확인하는 법", "jobs", ["1톤 화물차", "화물차 일자리", "초보 기사", "업무 조건"], "/jobs"],
    ["gyeonggi-incheon-cargo-jobs-guide", "경기·인천 화물 일자리 찾을 때 지역 조건 정리 가이드", "jobs", ["경기 화물 일자리", "인천 화물 일자리", "화물기사 구인", "운행 지역"], "/jobs"],
    ["lease-tonnage-choice-beginners", "지입차 시작 전 1톤과 5톤 차량 조건 비교하기: 초보자를 위한 준비 체크리스트", "lease", ["지입차 초보", "1톤 화물차", "5톤 화물차", "차량 선택"], "/lease"],
    ["lease-route-region-check-guide", "지입차 운행 지역 선택 전 경기·인천 동선 확인법", "lease", ["지입차 운행", "경기 지입차", "인천 지입차", "운행 동선"], "/lease"],
    ["one-point-four-vs-two-point-five-ton-guide", "1.4톤과 2.5톤 화물차 업무 비교 전 확인할 기준", "cargo-practice", ["1.4톤 화물차", "2.5톤 화물차", "화물차 업무", "톤수 비교"], "/jobs"],
    ["cargo-vs-wingbody-work-guide", "카고와 윙바디 화물차 차이와 업무 선택 기준", "cargo-practice", ["카고 화물차", "윙바디 화물차", "차량 종류", "화물차 업무"], "/jobs"],
  ])("simulates the stored draft %s with one expected CTA", async (slug, title, categorySlug, tags, expectedHref) => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: slug,
      slug,
      title,
      tags,
      category: category(categorySlug),
    }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual([expectedHref]);
  });

  it("uses title only when contextual-category tags have no intent signal", async () => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: "title-fallback",
      slug: "title-fallback",
      title: "카고와 윙바디 업무 선택 기준",
      tags: ["카고", "윙바디"],
      category: category("cargo-practice"),
    }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual(["/jobs"]);
  });

  it("resolves a strong lease signal in cargo-practice and omits neutral practice content", async () => {
    makeAllServicesAvailable();
    const leaseResult = await getBlogArticleDiscovery(article({
      id: "practice-lease",
      slug: "practice-lease",
      title: "차량 운행 준비",
      tags: ["지입차"],
      category: category("cargo-practice"),
    }), publishedAt);
    const neutralResult = await getBlogArticleDiscovery(article({
      id: "practice-neutral",
      slug: "practice-neutral",
      title: "화물차 정비와 안전 운전",
      tags: ["차량 관리", "운전 실무"],
      category: category("cargo-practice"),
    }), publishedAt);
    expect(leaseResult.serviceLinks.map((link) => link.href)).toEqual(["/lease"]);
    expect(neutralResult.serviceLinks).toEqual([]);
  });

  it.each([
    ["CBT 처음 준비하기", ["CBT"], "/cbt"],
    ["화물차 구직 입문", ["구직"], "/jobs"],
    ["지입차 입문", ["지입차"], "/lease"],
    ["화물차를 처음 시작하는 법", ["초보 가이드"], null],
  ])("resolves beginner-guide context safely", async (title, tags, expectedHref) => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: title,
      slug: `beginner-${tags.length}-${expectedHref ?? "none"}`.replaceAll("/", ""),
      title,
      tags,
      category: category("beginner-guide"),
    }), publishedAt);
    expect(result.serviceLinks.map((link) => link.href)).toEqual(expectedHref ? [expectedHref] : []);
  });

  it("honors tags before title but refuses ambiguous tags", async () => {
    makeAllServicesAvailable();
    const tagPriority = await getBlogArticleDiscovery(article({
      id: "tag-priority",
      slug: "tag-priority",
      title: "지입차 시작 방법",
      tags: ["화물차 일자리"],
      category: category("cargo-practice"),
    }), publishedAt);
    const ambiguous = await getBlogArticleDiscovery(article({
      id: "ambiguous-tags",
      slug: "ambiguous-tags",
      title: "화물차 일자리 선택",
      tags: ["지입차", "화물차 일자리"],
      category: category("cargo-practice"),
    }), publishedAt);
    expect(tagPriority.serviceLinks.map((link) => link.href)).toEqual(["/jobs"]);
    expect(ambiguous.serviceLinks).toEqual([]);
  });

  it("refuses ambiguous title signals and does not match 리스 inside 체크리스트", async () => {
    makeAllServicesAvailable();
    const ambiguous = await getBlogArticleDiscovery(article({
      id: "ambiguous-title",
      slug: "ambiguous-title",
      title: "지입차 일자리 선택 가이드",
      tags: [],
      category: category("beginner-guide"),
    }), publishedAt);
    const substring = await getBlogArticleDiscovery(article({
      id: "substring-safety",
      slug: "substring-safety",
      title: "초보자 체크리스트",
      tags: [],
      category: category("beginner-guide"),
    }), publishedAt);
    expect(ambiguous.serviceLinks).toEqual([]);
    expect(substring.serviceLinks).toEqual([]);
  });

  it("handles malformed tags and unknown categories without inferring a CTA", async () => {
    makeAllServicesAvailable();
    const result = await getBlogArticleDiscovery(article({
      id: "unknown",
      slug: "unknown",
      title: "CBT 화물차 일자리 지입차",
      tags: [null, 42, ""] as unknown as string[],
      category: category("unknown-category"),
    }), publishedAt);
    expect(result.serviceLinks).toEqual([]);
  });
});
