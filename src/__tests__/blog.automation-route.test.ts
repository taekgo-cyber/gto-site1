import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/lib/blog/automation", () => ({ processDueBlogContentJobs: mocks.process }));
import { POST } from "@/app/api/cron/blog-content/route";

describe("Blog automation cron authorization", () => {
  afterEach(() => {
    delete process.env.BLOG_AUTOMATION_CRON_SECRET;
    vi.clearAllMocks();
  });

  it("fails closed before invoking the runner when the secret is absent or wrong", async () => {
    process.env.BLOG_AUTOMATION_CRON_SECRET = "a".repeat(32);
    const response = await POST(new Request("http://localhost/api/cron/blog-content", { method: "POST", headers: { authorization: `Bearer ${"b".repeat(32)}` } }));
    expect(response.status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("runs a bounded batch with the configured bearer secret", async () => {
    process.env.BLOG_AUTOMATION_CRON_SECRET = "a".repeat(32);
    mocks.process.mockResolvedValue({ claimed: 1, succeeded: 1 });
    const response = await POST(new Request("http://localhost/api/cron/blog-content", { method: "POST", headers: { authorization: `Bearer ${"a".repeat(32)}` } }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });
});
