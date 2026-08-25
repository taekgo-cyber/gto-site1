import { describe, expect, it } from "vitest";
import {
  assertLaunchOperationsAvailable,
  getKstDayWindow,
  parseLaunchSchedule,
  resolveLaunchPolicy,
  resolveRuntimeLaunchPolicy,
} from "@/lib/launch/policy";

const env = {
  LAUNCH_FREE_AT: "2026-10-01T00:00:00+09:00",
  LAUNCH_PAID_PRENOTICE_AT: "2026-11-01T00:00:00+09:00",
  LAUNCH_DISCOUNTED_PAID_AT: "2026-12-01T00:00:00+09:00",
  LAUNCH_STANDARD_PAID_AT: "2027-01-01T00:00:00+09:00",
};

describe("S23 launch policy", () => {
  const schedule = parseLaunchSchedule(env);

  it.each([
    ["2026-09-30T14:59:59.999Z", "PRELAUNCH"],
    ["2026-09-30T15:00:00.000Z", "FREE_LAUNCH"],
    ["2026-10-31T14:59:59.999Z", "FREE_LAUNCH"],
    ["2026-10-31T15:00:00.000Z", "PAID_PRENOTICE"],
    ["2026-11-30T15:00:00.000Z", "DISCOUNTED_PAID"],
    ["2026-12-31T15:00:00.000Z", "STANDARD_PAID"],
  ] as const)("resolves the exact KST boundary %s", (at, phase) => {
    expect(resolveLaunchPolicy({ now: new Date(at), schedule }).phase).toBe(phase);
  });

  it("never enables payment collection or invents a discount", () => {
    const discounted = resolveLaunchPolicy({ now: new Date("2026-12-01T00:00:00+09:00"), schedule });
    expect(discounted.paymentCollection).toBe("DISABLED");
    expect(discounted.monetizationActivation).toBe("FREE_ONLY");
    expect(discounted.pricingState).toBe("ACTIVATION_REQUIRED");
    expect(discounted).not.toHaveProperty("discountRate");
  });

  it("blocks production operations before launch and permits them at the boundary", () => {
    const before = resolveLaunchPolicy({ now: new Date("2026-09-30T14:59:59.999Z"), schedule });
    expect(() => assertLaunchOperationsAvailable(before)).toThrow("LAUNCH_OPERATIONS_NOT_AVAILABLE");
    expect(() => assertLaunchOperationsAvailable(resolveLaunchPolicy({ now: schedule.freeLaunchAt, schedule }))).not.toThrow();
  });

  it("rejects missing, non-KST and misordered configuration", () => {
    expect(() => parseLaunchSchedule({ ...env, LAUNCH_FREE_AT: undefined })).toThrow("LAUNCH_POLICY_FREE_AT_INVALID");
    expect(() => parseLaunchSchedule({ ...env, LAUNCH_FREE_AT: "2026-10-01T00:00:00Z" })).toThrow("LAUNCH_POLICY_FREE_AT_INVALID");
    expect(() => parseLaunchSchedule({ ...env, LAUNCH_PAID_PRENOTICE_AT: env.LAUNCH_FREE_AT })).toThrow("LAUNCH_POLICY_BOUNDARY_ORDER_INVALID");
  });

  it("requires explicit production config and rejects unsupported activation", () => {
    expect(() => resolveRuntimeLaunchPolicy(new Date(), { NODE_ENV: "production" })).toThrow("LAUNCH_POLICY_SCHEDULE_REQUIRED");
    expect(() => resolveRuntimeLaunchPolicy(new Date(), { ...env, NODE_ENV: "production", MONETIZATION_ACTIVATION_MODE: "LIVE" })).toThrow("LAUNCH_POLICY_ACTIVATION_MODE_INVALID");
  });

  it("uses Seoul midnight for daily operations windows", () => {
    const before = getKstDayWindow(new Date("2026-10-01T14:59:59.999Z"));
    const after = getKstDayWindow(new Date("2026-10-01T15:00:00.000Z"));
    expect(before.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(before.end).toEqual(after.start);
  });
});
