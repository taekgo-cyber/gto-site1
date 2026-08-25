import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  company: { count: vi.fn() }, supportTicket: { count: vi.fn() }, adCampaign: { count: vi.fn() },
  opsEvent: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() }, adminLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { buildOpsTelegramMessage, dispatchPendingOpsEvents, enqueueDailyOpsDigest, getDailyOpsCounts } from "@/lib/ops/service";

beforeEach(() => vi.clearAllMocks());

describe("S22 ops automation", () => {
  it("builds a compact daily digest and never invents contact fields", () => {
    const message = buildOpsTelegramMessage({ type: "DAILY_DIGEST", targetId: "2026-08-25", payload: { date: "2026-08-25", pendingCompanies: 3, openTickets: 4, urgentTickets: 1, staleTickets: 2, anomalies: 1, failedDeliveries: 0 } });
    expect(message.text).toContain("업체 승인 3건");
    expect(message.text).toContain("미처리 문의 4건");
    expect(message.adminPath).toBe("/admin/ops");
    expect(message.text).not.toMatch(/email|phone|businessNumber/i);
  });

  it("counts pending company, ticket and anomaly work from DB source of truth", async () => {
    prismaMock.company.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    prismaMock.supportTicket.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    prismaMock.adCampaign.count.mockResolvedValue(2);
    prismaMock.opsEvent.count.mockResolvedValue(1);
    await expect(getDailyOpsCounts(new Date("2026-08-25T00:00:00Z"))).resolves.toEqual({ pendingCompanies: 3, openTickets: 4, urgentTickets: 1, staleTickets: 2, companiesWithoutOwner: 1, expiredActiveAds: 2, anomalies: 3, failedDeliveries: 1 });
  });

  it("deduplicates the KST daily digest on a unique-key race", async () => {
    prismaMock.company.count.mockResolvedValue(0);
    prismaMock.supportTicket.count.mockResolvedValue(0);
    prismaMock.adCampaign.count.mockResolvedValue(0);
    prismaMock.opsEvent.count.mockResolvedValue(0);
    prismaMock.opsEvent.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    prismaMock.opsEvent.findUnique.mockResolvedValue({ id: "existing", status: "SENT", dedupeKey: "ops-digest:2026-08-25" });
    const result = await enqueueDailyOpsDigest(new Date("2026-08-25T03:00:00Z"));
    expect(result.id).toBe("existing");
    expect(prismaMock.opsEvent.create.mock.calls[0][0].data.dedupeKey).toBe("ops-digest:2026-08-25");
  });

  it("claims once and keeps a failed Telegram delivery retryable without raw errors", async () => {
    prismaMock.opsEvent.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    prismaMock.opsEvent.findMany.mockResolvedValue([{ id: "e1" }]);
    prismaMock.opsEvent.findUnique.mockResolvedValue({ id: "e1", type: "SUPPORT_TICKET", targetId: "t1", payload: { category: "ACCOUNT", summary: "문의", adminPath: "/admin/tickets/t1" }, attemptCount: 1 });
    prismaMock.opsEvent.update.mockResolvedValue({});
    const provider = { send: vi.fn().mockRejectedValue(new Error("token=do-not-leak raw provider failure")) };
    await expect(dispatchPendingOpsEvents({ provider, now: new Date("2026-08-25T00:00:00Z") })).resolves.toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(prismaMock.opsEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastErrorCode: "PROVIDER_FAILURE", lockedAt: null }) }));
    expect(JSON.stringify(prismaMock.opsEvent.update.mock.calls)).not.toContain("do-not-leak");
  });
});
