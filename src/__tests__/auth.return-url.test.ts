import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirects: [] as string[],
  readSessionToken: vi.fn(),
  verifySessionToken: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  readSessionToken: mocks.readSessionToken,
  verifySessionToken: mocks.verifySessionToken,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirects.push(url);
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
}));

import {
  DEFAULT_AUTH_REDIRECT,
  buildLoginUrl,
  buildSafeReturnTo,
  normalizeAuthRedirect,
} from "@/lib/auth/redirect";

const ACTIVE_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "홍길동",
  nickname: "gildong",
  phone: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date(),
  deletedAt: null,
};

async function loadDal() {
  vi.resetModules();
  mocks.redirects.length = 0;
  return import("@/lib/auth/dal");
}

describe("auth return-url helpers", () => {
  it("builds an encoded login URL preserving the destination", () => {
    expect(buildLoginUrl("/lease/write")).toBe("/login?next=%2Flease%2Fwrite");
  });

  it("preserves documented query through the login URL", () => {
    expect(buildLoginUrl("/notifications?page=2")).toBe(
      "/login?next=%2Fnotifications%3Fpage%3D2",
    );
    expect(buildLoginUrl("/company/leads?companyId=c1&leadId=l2")).toBe(
      "/login?next=%2Fcompany%2Fleads%3FcompanyId%3Dc1%26leadId%3Dl2",
    );
  });

  it("falls back to the default destination when returnTo is missing", () => {
    expect(buildLoginUrl()).toBe(
      `/login?next=${encodeURIComponent(DEFAULT_AUTH_REDIRECT)}`,
    );
    expect(buildLoginUrl(undefined)).toBe(buildLoginUrl());
  });

  it("round-trips an encoded next back through the normalizer", () => {
    for (const destination of [
      "/lease/write",
      "/notifications?page=2",
      "/company/leads?companyId=c1&leadId=l2",
      "/mypage/lead?page=2&pageSize=20",
      "/cbt/cat-1/practice?mode=wrong",
    ]) {
      const loginUrl = new URL(buildLoginUrl(destination), "https://service.example");
      expect(normalizeAuthRedirect(loginUrl.searchParams.get("next"))).toBe(destination);
    }
  });

  it("encodes CBT practice destinations so inner query markers survive", () => {
    expect(buildLoginUrl("/cbt/cat-1/practice?mode=wrong")).toBe(
      "/login?next=%2Fcbt%2Fcat-1%2Fpractice%3Fmode%3Dwrong",
    );
  });

  it("buildSafeReturnTo keeps only documented single-string keys", () => {
    expect(
      buildSafeReturnTo(
        "/company/leads",
        { companyId: "c1", leadId: "l2", page: "2", unlockError: "1", q: ["a", "b"] },
        ["companyId", "leadId", "page"],
      ),
    ).toBe("/company/leads?companyId=c1&leadId=l2&page=2");
  });

  it("buildSafeReturnTo drops transient banner params on company ads", () => {
    expect(
      buildSafeReturnTo(
        "/company/ads",
        { companyId: "c1", message: "saved", error: "boom" },
        ["companyId"],
      ),
    ).toBe("/company/ads?companyId=c1");
  });

  it("buildSafeReturnTo returns the bare pathname without params or keys", () => {
    expect(buildSafeReturnTo("/cbt/my")).toBe("/cbt/my");
    expect(buildSafeReturnTo("/mypage", { page: "2" }, [])).toBe("/mypage");
    expect(buildSafeReturnTo("/lease/write", { page: "" }, ["page"])).toBe("/lease/write");
  });
});

describe("normalizeAuthRedirect safety contract", () => {
  it("accepts local paths with query", () => {
    expect(normalizeAuthRedirect("/mypage/lead?page=2")).toBe("/mypage/lead?page=2");
    expect(normalizeAuthRedirect("/lease/abc/edit")).toBe("/lease/abc/edit");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\\\evil.example/path",
    "javascript:alert(1)",
    "nota-path",
    "/login",
    "/login?next=/mypage",
    "/signup",
    "/signup?next=/mypage",
  ])("rejects unsafe or looping destination %s", (value) => {
    expect(normalizeAuthRedirect(value)).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it("rejects overlong and non-string input", () => {
    expect(normalizeAuthRedirect(`/${"a".repeat(2048)}`)).toBe(DEFAULT_AUTH_REDIRECT);
    expect(normalizeAuthRedirect(["/mypage", "/lease/write"])).toBe(DEFAULT_AUTH_REDIRECT);
    expect(normalizeAuthRedirect(undefined)).toBe(DEFAULT_AUTH_REDIRECT);
    expect(normalizeAuthRedirect("   ")).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it("keeps lone percent-encoded paths same-origin (no open redirect)", () => {
    // WHATWG URL tolerates invalid percent sequences in paths; the value
    // stays a same-origin path, so it is preserved rather than rejected.
    expect(normalizeAuthRedirect("/cbt/%E0%A4%A")).toBe("/cbt/%E0%A4%A");
  });
});

describe("requireUser returnTo contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirects.length = 0;
  });

  it("redirects anonymous callers to login with the encoded destination", async () => {
    const { requireUser } = await loadDal();
    mocks.readSessionToken.mockResolvedValue(null);
    await expect(requireUser("/lease/write")).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });
    expect(mocks.redirects).toEqual(["/login?next=%2Flease%2Fwrite"]);
  });

  it("preserves query on P1 routes (notifications/company/cbt)", async () => {
    const { requireUser } = await loadDal();
    mocks.readSessionToken.mockResolvedValue(null);
    await expect(requireUser("/notifications?page=2")).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });
    expect(mocks.redirects).toEqual(["/login?next=%2Fnotifications%3Fpage%3D2"]);

    const reloaded = await loadDal();
    mocks.readSessionToken.mockResolvedValue(null);
    await expect(reloaded.requireUser("/cbt/my")).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });
    expect(mocks.redirects).toEqual(["/login?next=%2Fcbt%2Fmy"]);
  });

  it("expired-session callers on proxy-covered routes keep next via returnTo", async () => {
    const { requireUser } = await loadDal();
    // Cookie present at the edge but invalid server-side: verify fails.
    mocks.readSessionToken.mockResolvedValue("stale-token");
    mocks.verifySessionToken.mockReturnValue(null);
    await expect(
      requireUser("/company/leads?companyId=c1&leadId=l2"),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(mocks.redirects).toEqual([
      "/login?next=%2Fcompany%2Fleads%3FcompanyId%3Dc1%26leadId%3Dl2",
    ]);
  });

  it("falls back to the default destination without returnTo", async () => {
    const { requireUser } = await loadDal();
    mocks.readSessionToken.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(mocks.redirects).toEqual([
      `/login?next=${encodeURIComponent(DEFAULT_AUTH_REDIRECT)}`,
    ]);
  });

  it("returns the user without redirect when authenticated", async () => {
    const { requireUser } = await loadDal();
    mocks.readSessionToken.mockResolvedValue("valid-token");
    mocks.verifySessionToken.mockReturnValue({ sub: "user-1" });
    mocks.findUnique.mockResolvedValue(ACTIVE_USER);
    const user = await requireUser("/lease/write");
    expect(user.id).toBe("user-1");
    expect(mocks.redirects).toHaveLength(0);
  });
});

describe("requireRole authorization semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirects.length = 0;
  });

  it("keeps wrong-role denial as notFound (never a login redirect)", async () => {
    const { requireRole } = await loadDal();
    mocks.readSessionToken.mockResolvedValue("valid-token");
    mocks.verifySessionToken.mockReturnValue({ sub: "user-1" });
    mocks.findUnique.mockResolvedValue({ ...ACTIVE_USER, role: "USER" });
    await expect(requireRole("ADMIN")).rejects.toMatchObject({
      digest: "NEXT_NOT_FOUND",
    });
    expect(mocks.redirects).toHaveLength(0);
  });

  it("passes authorized roles through", async () => {
    const { requireRole } = await loadDal();
    mocks.readSessionToken.mockResolvedValue("valid-token");
    mocks.verifySessionToken.mockReturnValue({ sub: "admin-1" });
    mocks.findUnique.mockResolvedValue({ ...ACTIVE_USER, id: "admin-1", role: "ADMIN" });
    const user = await requireRole("ADMIN");
    expect(user.role).toBe("ADMIN");
    expect(mocks.redirects).toHaveLength(0);
  });
});
