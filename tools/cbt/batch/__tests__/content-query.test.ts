import { describe, expect, it } from "vitest";
import { listGeneratedByStatus } from "../content-query";
import { createFakeBatchContentDb } from "./fakeContentStore";

describe("listGeneratedByStatus", () => {
  it("지정 상태의 GeneratedQuestion만 조회한다", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED", createdAt: new Date(1) });
    fake.helpers.seedGenerated({ id: "g2", status: "APPROVED", createdAt: new Date(2) });
    fake.helpers.seedGenerated({ id: "g3", status: "QA_PASSED", createdAt: new Date(3) });

    const passed = await listGeneratedByStatus(fake.batchContentDb, "QA_PASSED");
    expect(passed.map((r) => r.id)).toEqual(["g1", "g3"]);

    const approved = await listGeneratedByStatus(fake.batchContentDb, "APPROVED");
    expect(approved.map((r) => r.id)).toEqual(["g2"]);
  });

  it("createdAt asc 순서로 정렬된다", async () => {
    const fake = createFakeBatchContentDb();
    fake.helpers.seedGenerated({ id: "g3", status: "QA_PASSED", createdAt: new Date(3) });
    fake.helpers.seedGenerated({ id: "g1", status: "QA_PASSED", createdAt: new Date(1) });
    fake.helpers.seedGenerated({ id: "g2", status: "QA_PASSED", createdAt: new Date(2) });

    const rows = await listGeneratedByStatus(fake.batchContentDb, "QA_PASSED");
    expect(rows.map((r) => r.id)).toEqual(["g1", "g2", "g3"]);
  });

  it("대상이 없으면 빈 배열을 반환한다", async () => {
    const fake = createFakeBatchContentDb();
    const rows = await listGeneratedByStatus(fake.batchContentDb, "FAILED");
    expect(rows).toEqual([]);
  });
});
