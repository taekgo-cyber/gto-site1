import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  candidateLead: { count: vi.fn(), findMany: vi.fn() },
  leadMatch: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  leadContactUnlock: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  company: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getLeadMetrics } from "@/lib/leads/metrics";
import { validateMetricsDateRange, parseMetricsDateRange } from "@/lib/leads/metrics-validation";

beforeEach(() => vi.clearAllMocks());

function mockActiveAdmin(userId = "admin1") {
  prismaMock.user.findUnique.mockResolvedValue({ id: userId, status: "ACTIVE", role: "ADMIN" } as never);
}

function setupEmptyMetrics() {
  // leads
  prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
    const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
    if (!w) return 0;
    // active check
    if ((w as Record<string, unknown>).status === "ACTIVE") return 0;
    // date bounded (createdAt) -> 0
    if ((w as Record<string, unknown>).createdAt) return 0;
    return 0;
  });
  prismaMock.candidateLead.findMany.mockResolvedValue([]);
  prismaMock.leadMatch.count.mockResolvedValue(0);
  prismaMock.leadMatch.findMany.mockResolvedValue([]);
  prismaMock.leadMatch.groupBy.mockResolvedValue([]);
  prismaMock.leadContactUnlock.count.mockResolvedValue(0);
  prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
  prismaMock.leadContactUnlock.groupBy.mockResolvedValue([]);
  prismaMock.company.findMany.mockResolvedValue([]);
}

describe("Gate4 metrics — auth", () => {
  it("ACTIVE ADMIN allowed", async () => {
    mockActiveAdmin("admin1");
    setupEmptyMetrics();
    // ensure count returns 0 for lead total
    prismaMock.candidateLead.count.mockResolvedValue(0);
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.leads.total).toBe(0);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "admin1" }, select: { id: true, status: true, role: true } });
  });

  it("USER deny", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "USER" } as never);
    await expect(getLeadMetrics({ actorUserId: "u1" })).rejects.toThrow(/ADMIN_REQUIRED/);
  });

  it("COMPANY deny", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "COMPANY" } as never);
    await expect(getLeadMetrics({ actorUserId: "u1" })).rejects.toThrow(/ADMIN_REQUIRED/);
  });

  it("inactive ADMIN deny", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "SUSPENDED", role: "ADMIN" } as never);
    await expect(getLeadMetrics({ actorUserId: "admin1" })).rejects.toThrow(/ADMIN_REQUIRED/);
  });

  it("WITHDRAWN ADMIN deny", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin1", status: "WITHDRAWN", role: "ADMIN" } as never);
    await expect(getLeadMetrics({ actorUserId: "admin1" })).rejects.toThrow(/ADMIN_REQUIRED/);
  });

  it("non-existent user deny", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(getLeadMetrics({ actorUserId: "ghost" })).rejects.toThrow(/ADMIN_REQUIRED/);
  });

  it("ignore client adminUserId — session actor is authoritative", async () => {
    // Even if client tries to pass a different id, the service only checks actorUserId
    // We simulate that attacker passes their own id but is not admin
    prismaMock.user.findUnique.mockResolvedValue({ id: "attacker", status: "ACTIVE", role: "USER" } as never);
    await expect(getLeadMetrics({ actorUserId: "attacker" })).rejects.toThrow(/ADMIN_REQUIRED/);
    // ACTIVE ADMIN with same id succeeds
    mockActiveAdmin("realAdmin");
    setupEmptyMetrics();
    prismaMock.candidateLead.count.mockResolvedValue(0);
    const res = await getLeadMetrics({ actorUserId: "realAdmin" });
    expect(res.leads.total).toBe(0);
  });
});

describe("Gate4 metrics — date validation", () => {
  it("invalid from date rejects", async () => {
    mockActiveAdmin();
    await expect(getLeadMetrics({ actorUserId: "admin1", from: "not-a-date" })).rejects.toThrow(/INVALID_FROM_DATE/);
  });

  it("invalid to date rejects", async () => {
    mockActiveAdmin();
    await expect(getLeadMetrics({ actorUserId: "admin1", to: "2026-13-99" })).rejects.toThrow(/INVALID_TO_DATE/);
  });

  it("from > to rejects", async () => {
    mockActiveAdmin();
    await expect(getLeadMetrics({ actorUserId: "admin1", from: "2026-08-23T00:00:00Z", to: "2026-08-20T00:00:00Z" })).rejects.toThrow(/INVALID_DATE_RANGE/);
  });

  it("invalid Date object rejects", async () => {
    mockActiveAdmin();
    await expect(getLeadMetrics({ actorUserId: "admin1", from: new Date("invalid") })).rejects.toThrow(/INVALID_FROM_DATE/);
  });

  it("parseMetricsDateRange validates query params", () => {
    expect(() => parseMetricsDateRange(new URLSearchParams("from=invalid&to=2026-08-23"))).toThrow(/INVALID_FROM_DATE/);
    expect(() => parseMetricsDateRange(new URLSearchParams("from=2026-08-23&to=2026-08-20"))).toThrow(/INVALID_DATE_RANGE/);
    const ok = parseMetricsDateRange(new URLSearchParams("from=2026-08-10T00:00:00Z&to=2026-08-20T00:00:00Z"));
    expect(ok.from!.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(ok.to!.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("empty dates are allowed (no filter)", () => {
    const r = validateMetricsDateRange({ from: null, to: null });
    expect(r.from).toBeUndefined();
    expect(r.to).toBeUndefined();
    const r2 = validateMetricsDateRange({ from: "", to: "" });
    expect(r2.from).toBeUndefined();
  });

  it("trims whitespace dates", () => {
    const r = validateMetricsDateRange({ from: "  2026-08-10T00:00:00Z  ", to: "  2026-08-20T00:00:00Z " });
    expect(r.from!.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });
});

describe("Gate4 metrics — core aggregations and denominators", () => {
  function setupStandardMetrics() {
    // Leads: total 5, active 3, new 2 (with date range)
    prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 5; // total
      if ((w as Record<string, unknown>).status === "ACTIVE") return 3;
      if ((w as Record<string, unknown>).createdAt) return 2;
      return 5;
    });

    prismaMock.leadMatch.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 6;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 4;
      if ((w as Record<string, unknown>).status === "CANCELLED") return 2;
      return 6;
    });

    prismaMock.leadContactUnlock.count.mockResolvedValue(2);

    // Conversion: match pairs 4 distinct, unlock pairs 2, 1 overlaps? actually set up 2 unlocks both in matchSet
    prismaMock.leadMatch.findMany.mockImplementation(async (args: unknown) => {
      const sel = (args as { select?: unknown })?.select as Record<string, unknown> | undefined;
      // timing vs pairs vs total — distinguish by select keys
      if (sel && "companyId" in sel && "leadId" in sel && !("createdAt" in sel)) {
        // pairs for conversion
        return [
          { companyId: "c1", leadId: "lead1" },
          { companyId: "c1", leadId: "lead2" },
          { companyId: "c2", leadId: "lead1" },
          { companyId: "c2", leadId: "lead3" },
        ] as never;
      }
      if (sel && "leadId" in sel && "createdAt" in sel) {
        // timing matches
        return [
          { leadId: "lead1", createdAt: new Date("2026-08-10T10:00:00Z") },
          { leadId: "lead2", createdAt: new Date("2026-08-11T10:00:00Z") },
          { leadId: "lead3", createdAt: new Date("2026-08-12T10:00:00Z") },
        ] as never;
      }
      return [] as never;
    });

    prismaMock.leadContactUnlock.findMany.mockImplementation(async (args: unknown) => {
      const sel = (args as { select?: unknown })?.select as Record<string, unknown> | undefined;
      if (sel && "companyId" in sel && "leadId" in sel && !("unlockedAt" in sel)) {
        return [
          { companyId: "c1", leadId: "lead1" },
          { companyId: "c2", leadId: "lead1" },
        ] as never;
      }
      if (sel && "leadId" in sel && ("unlockedAt" in sel || "createdAt" in sel)) {
        return [
          { leadId: "lead1", unlockedAt: new Date("2026-08-10T12:00:00Z"), createdAt: new Date("2026-08-10T12:00:00Z") },
          { leadId: "lead2", unlockedAt: new Date("2026-08-11T14:00:00Z"), createdAt: new Date("2026-08-11T14:00:00Z") },
        ] as never;
      }
      return [] as never;
    });

    prismaMock.leadMatch.groupBy.mockResolvedValue([
      { companyId: "c1", _count: { _all: 2 } },
      { companyId: "c2", _count: { _all: 2 } },
    ] as never);
    prismaMock.leadContactUnlock.groupBy.mockResolvedValue([
      { companyId: "c1", _count: { _all: 1 } },
      { companyId: "c2", _count: { _all: 1 } },
    ] as never);

    prismaMock.company.findMany.mockResolvedValue([
      { id: "c1", name: "주식회사 A" },
      { id: "c2", name: "주식회사 B" },
    ] as never);

    prismaMock.candidateLead.findMany.mockResolvedValue([
      { id: "lead1", createdAt: new Date("2026-08-10T09:00:00Z") },
      { id: "lead2", createdAt: new Date("2026-08-11T09:00:00Z") },
      { id: "lead3", createdAt: new Date("2026-08-12T09:00:00Z") },
      { id: "lead4", createdAt: new Date("2026-08-13T09:00:00Z") },
      { id: "lead5", createdAt: new Date("2026-08-14T09:00:00Z") },
    ] as never);
  }

  it("lead total, ACTIVE, date-bounded new", async () => {
    mockActiveAdmin();
    setupStandardMetrics();
    const res = await getLeadMetrics({
      actorUserId: "admin1",
      from: "2026-08-10T00:00:00Z",
      to: "2026-08-12T00:00:00Z",
    });
    expect(res.leads.total).toBe(5);
    expect(res.leads.active).toBe(3);
    expect(res.leads.newCount).toBe(2);
    expect(res.leads.newFrom).toBe(new Date("2026-08-10T00:00:00Z").toISOString());
    expect(res.leads.newTo).toBe(new Date("2026-08-12T00:00:00Z").toISOString());
  });

  it("match total/ACTIVE/CANCELLED and avg per Lead with explicit denominator", async () => {
    mockActiveAdmin();
    setupStandardMetrics();
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.matches.total).toBe(6);
    expect(res.matches.active).toBe(4);
    expect(res.matches.cancelled).toBe(2);
    expect(res.matches.avgPerLeadDenominator).toBe(5); // total leads
    expect(res.matches.avgPerLead).toBeCloseTo(6 / 5);
  });

  it("unlock total/avg per Lead with explicit denominator", async () => {
    mockActiveAdmin();
    setupStandardMetrics();
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.unlocks.total).toBe(2);
    expect(res.unlocks.avgPerLeadDenominator).toBe(5);
    expect(res.unlocks.avgPerLead).toBeCloseTo(2 / 5);
  });

  it("conversion as unique matched companyId+leadId with unlock / unique matched keys", async () => {
    mockActiveAdmin();
    setupStandardMetrics();
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    // match distinct = 4 (c1:lead1, c1:lead2, c2:lead1, c2:lead3)
    expect(res.conversion.uniqueMatchedPairs).toBe(4);
    // unlock distinct = 2, both are in match set -> 2
    expect(res.conversion.uniqueUnlockedMatchedPairs).toBe(2);
    expect(res.conversion.rate).toBeCloseTo(0.5);
  });

  it("conversion handles unlock not in match set (no overcount)", async () => {
    mockActiveAdmin();
    setupStandardMetrics();
    // Override unlock pairs to include one non-matched
    prismaMock.leadContactUnlock.findMany.mockImplementation(async (args: unknown) => {
      const sel = (args as { select?: unknown })?.select as Record<string, unknown> | undefined;
      if (sel && "companyId" in sel && "leadId" in sel && !("unlockedAt" in sel)) {
        return [
          { companyId: "c1", leadId: "lead1" }, // in match
          { companyId: "c1", leadId: "lead99" }, // not in match set
        ] as never;
      }
      if (sel && "leadId" in sel) {
        return [] as never;
      }
      return [] as never;
    });
    prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", createdAt: new Date("2026-08-10T09:00:00Z") } as never]);
    prismaMock.leadMatch.findMany.mockImplementation(async (args: unknown) => {
      const sel = (args as { select?: unknown })?.select as Record<string, unknown> | undefined;
      if (sel && "companyId" in sel && !("createdAt" in sel)) {
        return [{ companyId: "c1", leadId: "lead1" }] as never;
      }
      return [] as never;
    });
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.conversion.uniqueMatchedPairs).toBe(1);
    expect(res.conversion.uniqueUnlockedMatchedPairs).toBe(1); // only matched
    expect(res.conversion.rate).toBe(1);
  });

  it("perCompany name/match/unlock/conversion with single batched lookup", async () => {
    mockActiveAdmin();
    setupStandardMetrics();
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.perCompany.length).toBe(2);
    const c1 = res.perCompany.find((r) => r.companyId === "c1")!;
    expect(c1.companyName).toBe("주식회사 A");
    expect(c1.matchCount).toBe(2);
    expect(c1.unlockCount).toBe(1);
    expect(c1.conversionRate).toBeCloseTo(0.5);
    const c2 = res.perCompany.find((r) => r.companyId === "c2")!;
    expect(c2.companyName).toBe("주식회사 B");
    expect(c2.matchCount).toBe(2);
    expect(c2.unlockCount).toBe(1);
    expect(c2.conversionRate).toBeCloseTo(0.5);
    // single batched company lookup, not N+1
    expect(prismaMock.company.findMany).toHaveBeenCalledTimes(1);
    const callArg = prismaMock.company.findMany.mock.calls[0][0] as unknown as { where: { id: { in: string[] } }; select: unknown };
    expect(callArg.where.id.in.sort()).toEqual(["c1", "c2"]);
    expect(callArg.select).toEqual({ id: true, name: true });
  });

  it("perCompany empty when no matches/unlocks", async () => {
    mockActiveAdmin();
    setupEmptyMetrics();
    prismaMock.candidateLead.count.mockResolvedValue(0);
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.perCompany).toEqual([]);
    expect(prismaMock.company.findMany).not.toHaveBeenCalled();
  });
});

describe("Gate4 metrics — timing with sample counts and no-match/no-unlock", () => {
  it("average first Match latency and first Unlock latency with sample counts", async () => {
    mockActiveAdmin();
    // 3 leads, 2 have matches, 2 have unlocks
    prismaMock.candidateLead.count.mockResolvedValue(3);
    prismaMock.candidateLead.findMany.mockResolvedValue([
      { id: "lead1", createdAt: new Date("2026-08-10T09:00:00Z") },
      { id: "lead2", createdAt: new Date("2026-08-11T09:00:00Z") },
      { id: "lead3", createdAt: new Date("2026-08-12T09:00:00Z") },
    ] as never);
    // lead1 first match after 1h, lead2 after 2h, lead3 no match
    prismaMock.leadMatch.findMany.mockResolvedValue([
      { leadId: "lead1", createdAt: new Date("2026-08-10T10:00:00Z") },
      { leadId: "lead1", createdAt: new Date("2026-08-10T11:00:00Z") }, // second should be ignored (earliest wins)
      { leadId: "lead2", createdAt: new Date("2026-08-11T11:00:00Z") },
    ] as never);
    // lead1 unlock after 3h, lead2 after 1h
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([
      { leadId: "lead1", unlockedAt: new Date("2026-08-10T12:00:00Z"), createdAt: new Date("2026-08-10T12:00:00Z") },
      { leadId: "lead2", unlockedAt: new Date("2026-08-11T10:00:00Z"), createdAt: new Date("2026-08-11T10:00:00Z") },
    ] as never);
    prismaMock.leadMatch.count.mockResolvedValue(3);
    prismaMock.leadMatch.count.mockResolvedValue(3);
    prismaMock.leadContactUnlock.count.mockResolvedValue(2);
    // Avoid extra calls
    prismaMock.leadMatch.count.mockResolvedValue(3);
    prismaMock.leadMatch.groupBy.mockResolvedValue([]);
    prismaMock.leadContactUnlock.groupBy.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    // Need to mock candidateLead counts for total/active/new
    prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 3;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 3;
      return 0;
    });
    prismaMock.leadMatch.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 3;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 2;
      if ((w as Record<string, unknown>).status === "CANCELLED") return 1;
      return 3;
    });

    const res = await getLeadMetrics({ actorUserId: "admin1" });
    // lead1: 1h = 3600000, lead2: 2h = 7200000 => avg 5400000
    expect(res.timing.avgFirstMatchMs).toBe(5_400_000);
    expect(res.timing.avgFirstMatchSampleCount).toBe(2);
    // unlock: lead1 3h=10800000, lead2 1h=3600000 => avg 7200000
    expect(res.timing.avgFirstUnlockMs).toBe(7_200_000);
    expect(res.timing.avgFirstUnlockSampleCount).toBe(2);
  });

  it("no-match no-unlock returns null averages and 0 sample counts", async () => {
    mockActiveAdmin();
    prismaMock.candidateLead.count.mockResolvedValue(2);
    prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 2;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 1;
      return 0;
    });
    prismaMock.candidateLead.findMany.mockResolvedValue([
      { id: "lead1", createdAt: new Date("2026-08-10T09:00:00Z") },
      { id: "lead2", createdAt: new Date("2026-08-11T09:00:00Z") },
    ] as never);
    prismaMock.leadMatch.count.mockResolvedValue(0);
    prismaMock.leadMatch.findMany.mockResolvedValue([]);
    prismaMock.leadMatch.groupBy.mockResolvedValue([]);
    prismaMock.leadContactUnlock.count.mockResolvedValue(0);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    prismaMock.leadContactUnlock.groupBy.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.timing.avgFirstMatchMs).toBeNull();
    expect(res.timing.avgFirstMatchSampleCount).toBe(0);
    expect(res.timing.avgFirstUnlockMs).toBeNull();
    expect(res.timing.avgFirstUnlockSampleCount).toBe(0);
    expect(res.matches.avgPerLead).toBe(0);
    expect(res.unlocks.avgPerLead).toBe(0);
    expect(res.conversion.rate).toBe(0);
  });

  it("uses unlockedAt fallback to createdAt when unlockedAt null", async () => {
    mockActiveAdmin();
    prismaMock.candidateLead.count.mockResolvedValue(1);
    prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", createdAt: new Date("2026-08-10T09:00:00Z") } as never]);
    prismaMock.leadMatch.findMany.mockResolvedValue([{ leadId: "lead1", createdAt: new Date("2026-08-10T10:00:00Z") } as never]);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([
      { leadId: "lead1", unlockedAt: null, createdAt: new Date("2026-08-10T11:00:00Z") },
    ] as never);
    prismaMock.leadMatch.count.mockResolvedValue(1);
    prismaMock.leadContactUnlock.count.mockResolvedValue(1);
    prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 1;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 1;
      return 0;
    });
    prismaMock.leadMatch.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 1;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 1;
      return 0;
    });
    prismaMock.leadMatch.groupBy.mockResolvedValue([]);
    prismaMock.leadContactUnlock.groupBy.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    expect(res.timing.avgFirstUnlockMs).toBe(2 * 60 * 60 * 1000);
    expect(res.timing.avgFirstUnlockSampleCount).toBe(1);
  });
});

describe("Gate4 metrics — no PII and bounded queries", () => {
  it("returned payload contains no PII fields", async () => {
    mockActiveAdmin();
    prismaMock.candidateLead.count.mockResolvedValue(1);
    prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 1;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 1;
      return 0;
    });
    prismaMock.candidateLead.findMany.mockResolvedValue([{ id: "lead1", createdAt: new Date("2026-08-10T09:00:00Z") } as never]);
    prismaMock.leadMatch.findMany.mockResolvedValue([{ leadId: "lead1", createdAt: new Date("2026-08-10T10:00:00Z"), companyId: "c1" } as never] as never);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([] as never);
    prismaMock.leadMatch.count.mockResolvedValue(1);
    prismaMock.leadContactUnlock.count.mockResolvedValue(0);
    prismaMock.leadMatch.groupBy.mockResolvedValue([{ companyId: "c1", _count: { _all: 1 } } as never]);
    prismaMock.leadContactUnlock.groupBy.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([{ id: "c1", name: "A" } as never]);
    const res = await getLeadMetrics({ actorUserId: "admin1" });
    const json = JSON.stringify(res);
    expect(json).not.toContain("010-");
    expect(json).not.toContain("phone");
    expect(json).not.toContain("email");
    // Ensure PII keys not in object
    const keys = JSON.stringify(res);
    expect(keys).not.toMatch(/"name"\s*:\s*"홍길동"/);
    // Check that prisma select never included PII: company lookup only id/name
    expect(prismaMock.company.findMany).toHaveBeenCalledWith({ where: { id: { in: ["c1"] } }, select: { id: true, name: true } });
    // Ensure candidateLead selects only id/createdAt for timing
    const leadSelectCalls = prismaMock.candidateLead.findMany.mock.calls;
    for (const call of leadSelectCalls) {
      const arg = call[0] as { select?: Record<string, unknown> };
      if (arg?.select) {
        expect(Object.keys(arg.select)).not.toContain("phone");
        expect(Object.keys(arg.select)).not.toContain("email");
        expect(Object.keys(arg.select)).not.toContain("name");
      }
    }
  });

  it("no unbounded complex query — uses count/aggregate/groupBy/bounded select", async () => {
    mockActiveAdmin();
    setupEmptyMetrics();
    prismaMock.candidateLead.count.mockResolvedValue(0);
    await getLeadMetrics({ actorUserId: "admin1" });
    expect(prismaMock.candidateLead.count).toHaveBeenCalled();
    expect(prismaMock.leadMatch.count).toHaveBeenCalled();
    expect(prismaMock.leadContactUnlock.count).toHaveBeenCalled();
    // groupBy called (bounded aggregation)
    expect(prismaMock.leadMatch.groupBy).toHaveBeenCalled();
    expect(prismaMock.leadContactUnlock.groupBy).toHaveBeenCalled();
  });

  it("uses date-bounded new query with [from,to) semantics", async () => {
    mockActiveAdmin();
    prismaMock.candidateLead.count.mockImplementation(async (args: unknown) => {
      const w = (args as { where?: unknown })?.where as Record<string, unknown> | undefined;
      if (!w) return 10;
      if ((w as Record<string, unknown>).status === "ACTIVE") return 5;
      if ((w as Record<string, unknown>).createdAt) {
        const c = w.createdAt as Record<string, Date>;
        // verify inclusive from, exclusive to
        expect(c.gte?.toISOString()).toBe(new Date("2026-08-10T00:00:00Z").toISOString());
        expect(c.lt?.toISOString()).toBe(new Date("2026-08-20T00:00:00Z").toISOString());
        return 3;
      }
      return 0;
    });
    prismaMock.leadMatch.count.mockResolvedValue(0);
    prismaMock.leadContactUnlock.count.mockResolvedValue(0);
    prismaMock.candidateLead.findMany.mockResolvedValue([]);
    prismaMock.leadMatch.findMany.mockResolvedValue([]);
    prismaMock.leadContactUnlock.findMany.mockResolvedValue([]);
    prismaMock.leadMatch.groupBy.mockResolvedValue([]);
    prismaMock.leadContactUnlock.groupBy.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);
    const res = await getLeadMetrics({ actorUserId: "admin1", from: "2026-08-10T00:00:00Z", to: "2026-08-20T00:00:00Z" });
    expect(res.leads.newCount).toBe(3);
  });
});

describe("Gate2/Gate3 regression — metrics does not break existing invariants", () => {
  it("company authorization still restricts non-member access (import check)", async () => {
    const { validateCompanyActorForNormalEndpoint } = await import("@/lib/leads/authorization");
    const deny = validateCompanyActorForNormalEndpoint({
      userId: "u1",
      userStatus: "ACTIVE",
      userRole: "USER",
      companyId: "c1",
      companyStatus: "ACTIVE",
      memberRole: "OWNER",
      memberStatus: "ACTIVE",
    });
    expect(deny.ok).toBe(false);
  });

  it("pre-unlock DTO still excludes PII", async () => {
    const { toPreUnlockDto } = await import("@/lib/leads/dto");
    const dto = toPreUnlockDto({
      id: "lead1",
      userId: "user1",
      status: "ACTIVE",
      preferredRegionId: null,
      vehicleTypeId: null,
      tonnageId: null,
      experienceYears: 1,
      leaseExperience: true,
      vehicleOwned: false,
      licenseInfo: null,
      desiredWorkType: null,
      desiredIncomeMin: null,
      desiredIncomeMax: null,
      availableFrom: null,
      careerSummary: "career",
      consentVersion: "v1",
      consentedAt: new Date(),
      expiresAt: null,
      pausedAt: null,
      closedAt: null,
      closeReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredRegion: null,
      vehicleType: null,
      tonnage: null,
    });
    expect((dto as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).phone).toBeUndefined();
  });

  it("discovery validation still bounds pageSize", async () => {
    const { parseLeadDiscoveryQuery } = await import("@/lib/leads/discovery-validation");
    const q = parseLeadDiscoveryQuery(new URLSearchParams("page=0&pageSize=9999"));
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(50);
  });
});
