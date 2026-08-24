import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { blogArticle: { findUnique: mocks.findUnique, findFirst: mocks.findFirst } } }));

import { inspectGeneratedDraft, inspectGeneratedDraftStatic, readStoredAiQualityIssues } from "@/lib/blog/ai/quality";
import type { AiContentSource, GeneratedBlogDraft } from "@/lib/blog/ai/types";

const sources: AiContentSource[] = [{ type: "TONNAGE", id: "t-1", label: "5톤", facts: ["기준중량: 5000kg", "톤수명: 5톤"] }];
const base: GeneratedBlogDraft = {
  title: "5톤 화물차 준비 가이드",
  slug: "5ton-cargo-guide",
  excerpt: "화물차 준비사항을 정리합니다.",
  contentMarkdown: "# 준비 가이드\n\n" + "안전한 준비사항을 실제 사이트 데이터에 맞춰 확인합니다. ".repeat(12) + "기준중량은 5000kg입니다.",
  seoTitle: "5톤 화물차 준비 가이드",
  seoDescription: "5톤 화물차 준비사항 안내",
  suggestedCategorySlug: null,
  tags: ["화물차", "5톤"],
};

describe("S18 AI quality guard", () => {
  it("flags PII, raw HTML and unsafe Markdown URLs as blocking errors", () => {
    const issues = inspectGeneratedDraftStatic({ ...base, contentMarkdown: "담당자: 홍길동 010-1234-5678 test@example.com <script>alert(1)</script> [x](javascript:alert(1))" }, sources);
    const codes = issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["PII_EMAIL", "PII_PHONE", "PII_PERSON_NAME", "RAW_HTML", "INVALID_URL"]));
  });

  it("warns on very short text and source-less numeric claims without auto-publishing anything", () => {
    const issues = inspectGeneratedDraftStatic({ ...base, contentMarkdown: "2027년 예상 99%" }, sources);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BODY_TOO_SHORT", severity: "WARNING" }),
      expect.objectContaining({ code: "UNSOURCED_NUMBER", severity: "WARNING" }),
    ]));
  });

  it("checks exact duplicate slug/title against canonical Blog", async () => {
    mocks.findUnique.mockResolvedValue({ id: "existing" });
    mocks.findFirst.mockResolvedValue({ id: "existing" });
    const report = await inspectGeneratedDraft(base, sources);
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DUPLICATE_SLUG", severity: "ERROR" }),
      expect.objectContaining({ code: "DUPLICATE_TITLE", severity: "WARNING" }),
    ]));
  });

  it("checks numeric claims outside the body as well", () => {
    const issues = inspectGeneratedDraftStatic({ ...base, title: "2028년 5톤 화물차 준비 가이드" }, sources);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNSOURCED_NUMBER", severity: "WARNING", message: expect.stringContaining("2028") }),
    ]));
  });

  it("checks tags for PII and bounds stored quality messages before rendering", () => {
    const issues = inspectGeneratedDraftStatic({ ...base, tags: ["test@example.com"] }, sources);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PII_EMAIL", severity: "ERROR" }),
    ]));

    const stored = readStoredAiQualityIssues({ quality: { issues: [
      { code: "X".repeat(100), severity: "WARNING", message: "M".repeat(800) },
      { code: "invalid", severity: "INFO", message: "ignored" },
    ] } });
    expect(stored).toEqual([{ code: "X".repeat(80), severity: "WARNING", message: "M".repeat(500) }]);
  });
});
