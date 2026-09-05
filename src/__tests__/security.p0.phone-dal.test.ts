import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobPost: { findUnique },
    region: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

import { getJobPostById } from "@/lib/jobs/dal";

const row = {
  id: "job-1",
  type: "JOB",
  title: "안전 운송",
  description: null,
  originAddress: null,
  destAddress: null,
  payType: null,
  payAmount: null,
  workType: null,
  workDescription: null,
  deadline: null,
  publishedAt: new Date("2026-09-01T00:00:00.000Z"),
  viewCount: 0,
  status: "OPEN",
  company: { name: "테스트 운송" },
  author: { nickname: null, name: "작성자" },
  originRegion: null,
  destRegion: null,
  vehicleType: null,
  tonnage: null,
};

describe("Security P0 job contact DTO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(row);
  });

  it("does not select or return a phone for an anonymous detail read", async () => {
    const result = await getJobPostById("job-1", { includeContact: false });
    expect(findUnique).toHaveBeenCalledTimes(1);
    const select = findUnique.mock.calls[0][0].select;
    expect(select.company.select).toEqual({ name: true });
    expect(JSON.stringify(select)).not.toContain("phone");
    expect(result?.companyPhone).toBeNull();
  });

  it("fetches the minimal phone field only for the authenticated path", async () => {
    findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ company: { phone: "010-1234-5678" } });
    const result = await getJobPostById("job-1", { includeContact: true });
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(findUnique.mock.calls[1][0].select).toEqual({
      company: { select: { phone: true } },
    });
    expect(result?.companyPhone).toBe("010-1234-5678");
  });
});
