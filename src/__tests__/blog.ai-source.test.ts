import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  leaseFindMany: vi.fn(),
  regionFindMany: vi.fn(),
  tonnageFindMany: vi.fn(),
  vehicleFindMany: vi.fn(),
  companyFindMany: vi.fn(),
  cbtCategoryFindMany: vi.fn(),
  blogFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leasePost: { findMany: mocks.leaseFindMany },
    region: { findMany: mocks.regionFindMany },
    tonnage: { findMany: mocks.tonnageFindMany },
    vehicleType: { findMany: mocks.vehicleFindMany },
    company: { findMany: mocks.companyFindMany },
    cbtCategory: { findMany: mocks.cbtCategoryFindMany },
    blogArticle: { findMany: mocks.blogFindMany },
  },
}));

import { AI_CONTENT_SOURCE_TYPES } from "@/lib/blog/ai/types";
import { loadAiContentSources, redactSensitiveText, validateAiContentGenerationRequest } from "@/lib/blog/ai/source";

describe("S18 AI content source privacy boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never exposes CandidateLead or monetization/analytics source types", () => {
    expect(AI_CONTENT_SOURCE_TYPES).not.toContain("CANDIDATE_LEAD");
    expect(AI_CONTENT_SOURCE_TYPES).not.toContain("LEAD_MATCH");
    expect(AI_CONTENT_SOURCE_TYPES).not.toContain("UNLOCK");
    expect(AI_CONTENT_SOURCE_TYPES).not.toContain("CREDIT");
    expect(AI_CONTENT_SOURCE_TYPES).not.toContain("AD_ANALYTICS");
  });

  it("selects only structured public Lease fields and excludes author/company/content/conditions", async () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    mocks.leaseFindMany.mockResolvedValue([{
      id: "lease-1",
      title: "5톤 매물",
      payType: "MONTHLY",
      payAmount: 5000000,
      workType: "FIXED",
      region: { name: "인천" },
      vehicleType: { name: "윙바디" },
      tonnage: { name: "5톤", weightKg: 5000 },
    }]);

    const sources = await loadAiContentSources({ topic: "5톤", targetKeyword: "5ton-guide", sourceType: "LEASE_POST", sourceIds: ["lease-1"] }, now);
    expect(sources).toHaveLength(1);
    const args = mocks.leaseFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: { in: ["lease-1"] }, status: "PUBLISHED", deletedAt: null, publishedAt: { lte: now, not: null } });
    expect(args.select).not.toHaveProperty("author");
    expect(args.select).not.toHaveProperty("company");
    expect(args.select).not.toHaveProperty("content");
    expect(args.select).not.toHaveProperty("conditions");
    expect(sources[0].facts.join(" ")).toContain("5000000");
  });

  it("projects Company to organization name/region only", async () => {
    mocks.companyFindMany.mockResolvedValue([{ id: "company-1", name: "안전물류", region: { name: "인천" } }]);
    await loadAiContentSources({ topic: "업체", targetKeyword: "company-guide", sourceType: "COMPANY_PUBLIC", sourceIds: ["company-1"] });
    const select = mocks.companyFindMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(["id", "name", "region"]);
    for (const forbidden of ["representativeName", "phone", "email", "businessNumber", "address", "addressDetail", "introduction"]) {
      expect(select).not.toHaveProperty(forbidden);
    }
  });

  it("fails closed if any requested source is missing or not public", async () => {
    mocks.regionFindMany.mockResolvedValue([{ id: "region-1", code: "ICN", name: "인천", depth: 1 }]);
    await expect(loadAiContentSources({ topic: "지역", targetKeyword: "region-guide", sourceType: "REGION", sourceIds: ["region-1", "region-2"] }))
      .rejects.toThrow("BLOG_AI_SOURCE_NOT_PUBLIC_OR_MISSING");
  });

  it("redacts email and phone patterns from text-based safe sources", () => {
    expect(redactSensitiveText("문의 test@example.com / 010-1234-5678 / 담당자: 홍길동")).toBe("문의 [email-redacted] / [phone-redacted] / 담당자: [name-redacted]");
  });

  it("rejects runtime source-type drift and PII in admin-authored prompt fields", () => {
    expect(() => validateAiContentGenerationRequest({
      topic: "지역 안내",
      targetKeyword: "region-guide",
      sourceType: "CANDIDATE_LEAD" as never,
      sourceIds: ["lead-1"],
    })).toThrow("BLOG_AI_SOURCE_TYPE_INVALID");

    expect(() => validateAiContentGenerationRequest({
      topic: "담당자 test@example.com 안내",
      targetKeyword: "contact-guide",
      sourceType: "REGION",
      sourceIds: ["region-1"],
    })).toThrow("BLOG_AI_REQUEST_PII_DETECTED");
  });

  it("redacts free-text source labels before they cross the provider boundary", async () => {
    mocks.leaseFindMany.mockResolvedValue([{
      id: "lease-private-label",
      title: "담당자: 홍길동 010-1234-5678 매물",
      payType: null,
      payAmount: null,
      workType: null,
      region: null,
      vehicleType: null,
      tonnage: null,
    }]);
    const [source] = await loadAiContentSources({
      topic: "공개 매물 안내",
      targetKeyword: "public-lease-guide",
      sourceType: "LEASE_POST",
      sourceIds: ["lease-private-label"],
    });
    expect(source.label).toBe("담당자: [name-redacted] [phone-redacted] 매물");
    expect(source.facts.join(" ")).not.toContain("홍길동");
    expect(source.facts.join(" ")).not.toContain("010-1234-5678");
  });
});
