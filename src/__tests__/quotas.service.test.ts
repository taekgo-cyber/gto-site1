import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeCompanyQuota, getCompanyQuotaStatus } from "@/lib/quotas/service";
import type {
  QuotaAllowanceTypeValue,
  QuotaConsumptionRecord,
  QuotaDalDb,
  QuotaEntitlementRecord,
  QuotaUsageRecord,
} from "@/lib/quotas/dal";

const authMock = vi.hoisted(() => ({
  resolveActiveCompanyActor: vi.fn(),
  canMatchOrUnlock: vi.fn(),
}));
vi.mock("@/lib/leads/authorization", () => authMock);

type FakeState = {
  entitlements: QuotaEntitlementRecord[];
  usages: Map<string, QuotaUsageRecord>;
  consumptions: Map<string, QuotaConsumptionRecord>;
  nextId: number;
};

function usageKey(companyId: string, allowanceType: QuotaAllowanceTypeValue, windowStart: Date): string {
  return `${companyId}:${allowanceType}:${windowStart.toISOString()}`;
}

function fakeDb(state: FakeState): QuotaDalDb {
  const db: QuotaDalDb = {
    companyRecruitmentEntitlement: {
      findMany: async ({ where }) => state.entitlements.filter((item) => item.companyId === where.companyId),
    },
    companyQuotaUsage: {
      findUnique: async ({ where }) => {
        const key = where.companyId_allowanceType_windowStart as { companyId: string; allowanceType: QuotaAllowanceTypeValue; windowStart: Date };
        return state.usages.get(usageKey(key.companyId, key.allowanceType, key.windowStart)) ?? null;
      },
      upsert: async ({ where, create }) => {
        const key = where.companyId_allowanceType_windowStart as { companyId: string; allowanceType: QuotaAllowanceTypeValue; windowStart: Date };
        const existing = state.usages.get(usageKey(key.companyId, key.allowanceType, key.windowStart));
        if (existing) return existing;
        const row = {
          id: `usage_${state.nextId++}`,
          companyId: create.companyId as string,
          allowanceType: create.allowanceType as QuotaAllowanceTypeValue,
          windowStart: create.windowStart as Date,
          windowEnd: create.windowEnd as Date,
          consumedCount: create.consumedCount as number,
        };
        state.usages.set(usageKey(row.companyId, row.allowanceType, row.windowStart), row);
        return row;
      },
      updateMany: async ({ where }) => {
        const row = [...state.usages.values()].find((item) => item.id === where.id && item.consumedCount < (where.consumedCount as { lt: number }).lt);
        if (!row) return { count: 0 };
        row.consumedCount += 1;
        return { count: 1 };
      },
    },
    companyQuotaConsumption: {
      findUnique: async ({ where }) => {
        const key = where.companyId_idempotencyKey as { companyId: string; idempotencyKey: string };
        return state.consumptions.get(`${key.companyId}:${key.idempotencyKey}`) ?? null;
      },
      create: async ({ data }) => {
        const key = `${data.companyId as string}:${data.idempotencyKey as string}`;
        const existing = state.consumptions.get(key);
        if (existing) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = {
          id: `consumption_${state.nextId++}`,
          companyId: data.companyId as string,
          quotaUsageId: data.quotaUsageId as string,
          allowanceType: data.allowanceType as QuotaAllowanceTypeValue,
          idempotencyKey: data.idempotencyKey as string,
          operationReference: (data.operationReference as string | null) ?? null,
          consumedCount: data.consumedCount as number,
        };
        state.consumptions.set(key, row);
        return row;
      },
    },
  };
  db.$transaction = async (fn) => fn(db);
  return db;
}

const now = new Date("2026-08-23T03:00:00.000Z");

function input(companyId = "c1", allowanceType: QuotaAllowanceTypeValue = "MATCH", idempotencyKey = "op-1") {
  return { actorUserId: "u1", companyId, allowanceType, idempotencyKey, operationId: idempotencyKey, now };
}

describe("Gate 4.1 quota usage service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.resolveActiveCompanyActor.mockResolvedValue({
      ok: true,
      actor: { userId: "u1", userStatus: "ACTIVE", userRole: "COMPANY", companyId: "c1", companyStatus: "ACTIVE", memberRole: "OWNER", memberStatus: "ACTIVE" },
    });
    authMock.canMatchOrUnlock.mockReturnValue(true);
  });

  it("reuses active-company authorization and denies STAFF", async () => {
    const state: FakeState = { entitlements: [], usages: new Map(), consumptions: new Map(), nextId: 1 };
    authMock.canMatchOrUnlock.mockReturnValue(false);
    await expect(getCompanyQuotaStatus({ ...input(), idempotencyKey: undefined }, fakeDb(state))).rejects.toThrow("ROLE_NOT_ALLOWED");
    expect(authMock.resolveActiveCompanyActor).toHaveBeenCalledWith("u1", "c1");
  });

  it("requires an ACTIVE user, Company, and membership on every request", async () => {
    const state: FakeState = { entitlements: [], usages: new Map(), consumptions: new Map(), nextId: 1 };
    for (const code of ["USER_INACTIVE", "COMPANY_INACTIVE", "MEMBER_INACTIVE"]) {
      authMock.resolveActiveCompanyActor.mockResolvedValueOnce({ ok: false, code, message: code });
      await expect(consumeCompanyQuota(input(), fakeDb(state))).rejects.toThrow(code);
    }
  });

  it("enforces NONE cap 1, idempotency, and company isolation", async () => {
    const state: FakeState = { entitlements: [], usages: new Map(), consumptions: new Map(), nextId: 1 };
    const db = fakeDb(state);
    const first = await consumeCompanyQuota(input("c1", "MATCH", "same-op"), db);
    const replay = await consumeCompanyQuota(input("c1", "MATCH", "same-op"), db);
    const exhausted = await consumeCompanyQuota(input("c1", "MATCH", "second-op"), db);
    const otherCompany = await consumeCompanyQuota(input("c2", "MATCH", "same-op"), db);
    expect(first.status).toBe("CONSUMED");
    expect(replay.status).toBe("ALREADY_CONSUMED");
    expect(exhausted.status).toBe("NO_QUOTA");
    expect(otherCompany.status).toBe("CONSUMED");
    expect([...state.usages.values()].find((row) => row.companyId === "c1")?.consumedCount).toBe(1);
  });

  it("uses highest active tier and preserves used count on upgrade", async () => {
    const state: FakeState = {
      entitlements: [
        { companyId: "c1", recruitmentTier: "GENERAL", validFrom: new Date("2026-08-01T00:00:00Z"), expiresAt: null },
        { companyId: "c1", recruitmentTier: "PREMIUM", validFrom: new Date("2026-08-22T00:00:00Z"), expiresAt: null },
        { companyId: "c1", recruitmentTier: "MAIN", validFrom: new Date("2026-08-01T00:00:00Z"), expiresAt: new Date("2026-08-22T00:00:00Z") },
      ],
      usages: new Map(),
      consumptions: new Map(),
      nextId: 1,
    };
    const db = fakeDb(state);
    for (const key of ["a", "b"]) await consumeCompanyQuota(input("c1", "MATCH", key), db);
    const status = await getCompanyQuotaStatus({ ...input("c1", "MATCH", "status"), idempotencyKey: undefined }, db);
    expect(status.recruitmentTier).toBe("PREMIUM");
    expect(status.cap).toBe(5);
    expect(status.consumedCount).toBe(2);
    expect(status.remaining).toBe(3);
  });

  it("keeps Contact Unlock quota at zero without credit fallback", async () => {
    const state: FakeState = { entitlements: [], usages: new Map(), consumptions: new Map(), nextId: 1 };
    const result = await consumeCompanyQuota(input("c1", "CONTACT_UNLOCK", "unlock-1"), fakeDb(state));
    expect(result.status).toBe("NO_QUOTA");
    expect(result.cap).toBe(0);
    expect(state.consumptions.size).toBe(0);
  });

  it("maps a duplicate consumption insert to ALREADY_CONSUMED", async () => {
    const state: FakeState = { entitlements: [], usages: new Map(), consumptions: new Map(), nextId: 1 };
    const db = fakeDb(state);
    await consumeCompanyQuota(input("c1", "MATCH", "race"), db);
    const result = await consumeCompanyQuota(input("c1", "MATCH", "race"), db);
    expect(result.status).toBe("ALREADY_CONSUMED");
    expect(result.consumptionId).toMatch(/^consumption_/);
  });
});
