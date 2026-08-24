import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  generate: vi.fn(),
  redirects: [] as string[],
}));

vi.mock("@/lib/auth/dal", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/blog/ai/service", () => ({ generateAiBlogDraft: mocks.generate }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirects.push(url);
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
  },
}));

import { generateAiBlogDraftAction } from "@/app/admin/blog/ai/actions";

describe("S18 admin AI action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirects.length = 0;
    mocks.requireRole.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  });

  it("redirects a successful generation directly to canonical Blog edit instead of catching NEXT_REDIRECT as an error", async () => {
    mocks.generate.mockResolvedValue({ article: { id: "article-1", status: "DRAFT" } });
    const form = new FormData();
    form.set("sourceType", "TONNAGE");
    form.set("topic", "5톤 가이드");
    form.set("targetKeyword", "5ton-guide");
    form.append("sourceIds", "ton-1");

    await expect(generateAiBlogDraftAction(form)).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(mocks.redirects).toHaveLength(1);
    expect(mocks.redirects[0]).toContain("/admin/blog/article-1/edit?message=");
    expect(mocks.redirects[0]).not.toContain("/admin/blog/ai?sourceType=");
  });
});
