import { describe, expect, it, vi } from "vitest";
import {
  validateCompanyActorForNormalEndpoint,
  canDiscoverLead,
  canMatchOrUnlock,
  deriveAndValidateCompanyContext,
  resolveActiveCompanyActor,
} from "@/lib/leads/authorization";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  companyMember: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

function base(actor: Partial<Parameters<typeof validateCompanyActorForNormalEndpoint>[0]> = {}) {
  return {
    userId: "u1",
    userStatus: "ACTIVE",
    userRole: "COMPANY",
    companyId: "c1",
    companyStatus: "ACTIVE",
    memberRole: "OWNER",
    memberStatus: "ACTIVE",
    ...actor,
  } as Parameters<typeof validateCompanyActorForNormalEndpoint>[0];
}

describe("company authorization matrix", () => {
  it("OWNER can discover and match/unlock", () => {
    const res = validateCompanyActorForNormalEndpoint(base({ memberRole: "OWNER" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(canDiscoverLead(res.actor)).toBe(true);
      expect(canMatchOrUnlock(res.actor)).toBe(true);
    }
  });

  it("MANAGER can discover and match/unlock", () => {
    const res = validateCompanyActorForNormalEndpoint(base({ memberRole: "MANAGER" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(canMatchOrUnlock(res.actor)).toBe(true);
  });

  it("STAFF can discover only", () => {
    const res = validateCompanyActorForNormalEndpoint(base({ memberRole: "STAFF" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(canDiscoverLead(res.actor)).toBe(true);
      expect(canMatchOrUnlock(res.actor)).toBe(false);
    }
  });

  it("ADMIN role is not allowed via normal endpoint (no bypass)", () => {
    const res = validateCompanyActorForNormalEndpoint(base({ userRole: "ADMIN" }));
    expect(res.ok).toBe(false);
  });

  it("USER role is forbidden", () => {
    const res = validateCompanyActorForNormalEndpoint(base({ userRole: "USER" }));
    expect(res.ok).toBe(false);
  });

  it("suspended user/company/member denied", () => {
    expect(validateCompanyActorForNormalEndpoint(base({ userStatus: "SUSPENDED" })).ok).toBe(false);
    expect(validateCompanyActorForNormalEndpoint(base({ companyStatus: "SUSPENDED" })).ok).toBe(false);
    expect(validateCompanyActorForNormalEndpoint(base({ memberStatus: "REMOVED" })).ok).toBe(false);
  });

  it("non-member denied", () => {
    expect(validateCompanyActorForNormalEndpoint(base({ memberRole: null, memberStatus: null })).ok).toBe(false);
  });

  it("derive and validate company context never trusts client alone", () => {
    expect(deriveAndValidateCompanyContext(["c1", "c2"], "c1").ok).toBe(true);
    expect(deriveAndValidateCompanyContext(["c1"], "c2").ok).toBe(false);
    expect(deriveAndValidateCompanyContext([], "c1").ok).toBe(false);
  });

  it("loads and validates the active company actor from persistence", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" });
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" });
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "MANAGER", status: "ACTIVE" });

    const result = await resolveActiveCompanyActor("u1", "c1");
    expect(result).toEqual({
      ok: true,
      actor: {
        userId: "u1",
        userStatus: "ACTIVE",
        userRole: "COMPANY",
        companyId: "c1",
        companyStatus: "ACTIVE",
        memberRole: "MANAGER",
        memberStatus: "ACTIVE",
      },
    });
    expect(prismaMock.companyMember.findUnique).toHaveBeenCalledWith({
      where: { userId_companyId: { userId: "u1", companyId: "c1" } },
      select: { role: true, status: true },
    });
  });

  it("rejects persistence states that are no longer active", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "SUSPENDED", role: "COMPANY" });
    prismaMock.company.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE" });
    prismaMock.companyMember.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    await expect(resolveActiveCompanyActor("u1", "c1")).resolves.toMatchObject({ ok: false, code: "USER_INACTIVE" });
  });
});
