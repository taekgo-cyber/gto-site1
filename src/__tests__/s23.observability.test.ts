import { describe, expect, it, vi } from "vitest";
import { createOperationalErrorEvent, logOperationalError } from "@/lib/observability/logger";

describe("S23 operational logging", () => {
  it("keeps only bounded identifiers and never serializes raw messages or PII", () => {
    const error = Object.assign(new Error("token=secret phone=010-1234-5678 DATABASE_URL=hidden"), { code: "P2002" });
    const event = createOperationalErrorEvent({
      operation: "support_ticket_create",
      actorType: "ANONYMOUS",
      category: "DATABASE",
      error,
      identifiers: {
        ticketId: "ticket_123",
        requesterPhone: "010-1234-5678",
        route: "/support",
      },
      now: new Date("2026-10-01T00:00:00Z"),
    });
    const serialized = JSON.stringify(event);
    expect(serialized).toContain("ticket_123");
    expect(serialized).toContain("P2002");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(event.timestamp).toBe("2026-10-01T00:00:00.000Z");
  });

  it("emits one structured JSON event", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logOperationalError({ operation: "readiness_check", actorType: "SYSTEM", category: "DATABASE", error: new Error("raw") });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() => JSON.parse(String(spy.mock.calls[0][0]))).not.toThrow();
    spy.mockRestore();
  });
});
