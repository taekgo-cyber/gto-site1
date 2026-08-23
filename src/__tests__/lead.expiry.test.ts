import { describe, expect, it, vi } from "vitest";
import { isEffectiveActiveLead, isInactiveByExpiry } from "@/lib/leads/validation";
import { isLeadEffectivelyActive } from "@/lib/leads/service";
import { findDiscoverableLeads } from "@/lib/leads/dal";
import * as fs from "node:fs";
import * as path from "node:path";

const prismaMock = vi.hoisted(() => ({ candidateLead: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("expiry / pause / close denial", () => {
  it("expiresAt <= now is inactive", () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 10000);
    expect(isInactiveByExpiry(past)).toBe(true);
    expect(isInactiveByExpiry(future)).toBe(false);
    expect(isInactiveByExpiry(null)).toBe(false);
  });

  it("discovery includes null/future expiry and excludes past expiry", async () => {
    prismaMock.candidateLead.findMany.mockResolvedValue([]);
    await findDiscoverableLeads();
    const query = prismaMock.candidateLead.findMany.mock.calls.at(-1)?.[0] as {
      where: { status: string; OR: Array<Record<string, unknown>> };
    };
    expect(query.where.status).toBe("ACTIVE");
    expect(query.where.OR[0]).toEqual({ expiresAt: null });
    expect(query.where.OR[1]?.expiresAt).toEqual(expect.objectContaining({ gt: expect.any(Date) }));
  });

  it("effective active requires ACTIVE + not expired + consent", () => {
    const base = {
      status: "ACTIVE" as const,
      expiresAt: null,
      consentVersion: "v1",
      consentedAt: new Date(),
    };
    expect(isEffectiveActiveLead(base)).toBe(true);
    expect(isLeadEffectivelyActive(base)).toBe(true);
    expect(isEffectiveActiveLead({ ...base, status: "PAUSED" as const })).toBe(false);
    expect(isEffectiveActiveLead({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
    expect(isEffectiveActiveLead({ ...base, consentVersion: "v0" })).toBe(false);
  });

  it("paused/closed/expired deny discovery/match/unlock", () => {
    const expiredLead = { status: "EXPIRED" as const, expiresAt: null, consentVersion: "v1", consentedAt: new Date() };
    const pausedLead = { status: "PAUSED" as const, expiresAt: null, consentVersion: "v1", consentedAt: new Date() };
    const closedLead = { status: "CLOSED" as const, expiresAt: null, consentVersion: "v1", consentedAt: new Date() };
    expect(isEffectiveActiveLead(expiredLead)).toBe(false);
    expect(isEffectiveActiveLead(pausedLead)).toBe(false);
    expect(isEffectiveActiveLead(closedLead)).toBe(false);
  });

  it("non-terminal limit: partial unique index SQL exists and not weakened to ACTIVE-only", () => {
    const sqlPath = path.join(process.cwd(), "prisma/migrations/20260822000000_add_candidate_lead_foundation/migration.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    // must contain partial unique WHERE status IN ('DRAFT','ACTIVE','PAUSED')
    expect(sql).toContain("candidate_leads_userId_non_terminal_unique");
    expect(sql).toContain("WHERE \"status\" IN ('DRAFT', 'ACTIVE', 'PAUSED')");
    // ensure not ACTIVE-only
    const activeOnlySnippet = "WHERE \"status\" = 'ACTIVE'";
    expect(sql).not.toContain(activeOnlySnippet);
    // also check table has consent/version and no phone snapshot column on unlocks
    expect(sql).toContain("lead_contact_unlocks");
    expect(sql).not.toMatch(/phone/i);
  });

  it("LeadContactUnlock has no phone snapshot column (schema file check)", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const unlockSection = schema.slice(schema.indexOf("model LeadContactUnlock"));
    expect(unlockSection).not.toMatch(/phone/i);
    expect(unlockSection).toContain("entitlementSource");
    expect(unlockSection).toContain("policyVersion");
    expect(unlockSection).toContain("consentVersion");
  });
});
