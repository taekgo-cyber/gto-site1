export const LAUNCH_TIME_ZONE = "Asia/Seoul" as const;

export type LaunchPhase =
  | "PRELAUNCH"
  | "FREE_LAUNCH"
  | "PAID_PRENOTICE"
  | "DISCOUNTED_PAID"
  | "STANDARD_PAID";

export type LaunchSchedule = {
  freeLaunchAt: Date;
  paidPrenoticeAt: Date;
  discountedPaidAt: Date;
  standardPaidAt: Date;
};

export type LaunchPolicy = {
  phase: LaunchPhase;
  timeZone: typeof LAUNCH_TIME_ZONE;
  effectiveAt: Date;
  nextPhase: Exclude<LaunchPhase, "PRELAUNCH"> | null;
  nextPhaseAt: Date | null;
  monetizationActivation: "FREE_ONLY";
  paymentCollection: "DISABLED";
  pricingState: "INACTIVE" | "FREE" | "PRENOTICE" | "ACTIVATION_REQUIRED";
  operationsAvailable: boolean;
};

type LaunchEnvironment = Partial<Record<
  | "NODE_ENV"
  | "LAUNCH_FREE_AT"
  | "LAUNCH_PAID_PRENOTICE_AT"
  | "LAUNCH_DISCOUNTED_PAID_AT"
  | "LAUNCH_STANDARD_PAID_AT"
  | "MONETIZATION_ACTIVATION_MODE",
  string | undefined
>>;

const KST_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;

// Local/test fallback only. Production must provide every boundary explicitly.
export const LOCAL_LAUNCH_SCHEDULE: LaunchSchedule = {
  freeLaunchAt: new Date("2026-10-01T00:00:00+09:00"),
  paidPrenoticeAt: new Date("2026-11-01T00:00:00+09:00"),
  discountedPaidAt: new Date("2026-12-01T00:00:00+09:00"),
  standardPaidAt: new Date("2027-01-01T00:00:00+09:00"),
};

function parseBoundary(name: string, raw: string | undefined): Date {
  const value = raw?.trim() ?? "";
  if (!KST_TIMESTAMP.test(value)) throw new Error(`LAUNCH_POLICY_${name}_INVALID`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`LAUNCH_POLICY_${name}_INVALID`);
  return parsed;
}

export function parseLaunchSchedule(env: LaunchEnvironment): LaunchSchedule {
  const schedule = {
    freeLaunchAt: parseBoundary("FREE_AT", env.LAUNCH_FREE_AT),
    paidPrenoticeAt: parseBoundary("PAID_PRENOTICE_AT", env.LAUNCH_PAID_PRENOTICE_AT),
    discountedPaidAt: parseBoundary("DISCOUNTED_PAID_AT", env.LAUNCH_DISCOUNTED_PAID_AT),
    standardPaidAt: parseBoundary("STANDARD_PAID_AT", env.LAUNCH_STANDARD_PAID_AT),
  };
  const ordered = [
    schedule.freeLaunchAt,
    schedule.paidPrenoticeAt,
    schedule.discountedPaidAt,
    schedule.standardPaidAt,
  ];
  if (ordered.some((value, index) => index > 0 && value.getTime() <= ordered[index - 1].getTime())) {
    throw new Error("LAUNCH_POLICY_BOUNDARY_ORDER_INVALID");
  }
  return schedule;
}

export function resolveLaunchPolicy(input: {
  now: Date;
  schedule: LaunchSchedule;
  monetizationActivation?: "FREE_ONLY";
}): LaunchPolicy {
  if (Number.isNaN(input.now.getTime())) throw new Error("LAUNCH_POLICY_NOW_INVALID");
  const activation = input.monetizationActivation ?? "FREE_ONLY";
  const { now, schedule } = input;

  if (now < schedule.freeLaunchAt) {
    return {
      phase: "PRELAUNCH",
      timeZone: LAUNCH_TIME_ZONE,
      effectiveAt: now,
      nextPhase: "FREE_LAUNCH",
      nextPhaseAt: schedule.freeLaunchAt,
      monetizationActivation: activation,
      paymentCollection: "DISABLED",
      pricingState: "INACTIVE",
      operationsAvailable: false,
    };
  }
  if (now < schedule.paidPrenoticeAt) {
    return {
      phase: "FREE_LAUNCH",
      timeZone: LAUNCH_TIME_ZONE,
      effectiveAt: now,
      nextPhase: "PAID_PRENOTICE",
      nextPhaseAt: schedule.paidPrenoticeAt,
      monetizationActivation: activation,
      paymentCollection: "DISABLED",
      pricingState: "FREE",
      operationsAvailable: true,
    };
  }
  if (now < schedule.discountedPaidAt) {
    return {
      phase: "PAID_PRENOTICE",
      timeZone: LAUNCH_TIME_ZONE,
      effectiveAt: now,
      nextPhase: "DISCOUNTED_PAID",
      nextPhaseAt: schedule.discountedPaidAt,
      monetizationActivation: activation,
      paymentCollection: "DISABLED",
      pricingState: "PRENOTICE",
      operationsAvailable: true,
    };
  }
  if (now < schedule.standardPaidAt) {
    return {
      phase: "DISCOUNTED_PAID",
      timeZone: LAUNCH_TIME_ZONE,
      effectiveAt: now,
      nextPhase: "STANDARD_PAID",
      nextPhaseAt: schedule.standardPaidAt,
      monetizationActivation: activation,
      paymentCollection: "DISABLED",
      pricingState: "ACTIVATION_REQUIRED",
      operationsAvailable: true,
    };
  }
  return {
    phase: "STANDARD_PAID",
    timeZone: LAUNCH_TIME_ZONE,
    effectiveAt: now,
    nextPhase: null,
    nextPhaseAt: null,
    monetizationActivation: activation,
    paymentCollection: "DISABLED",
    pricingState: "ACTIVATION_REQUIRED",
    operationsAvailable: true,
  };
}

export function resolveRuntimeLaunchPolicy(
  now = new Date(),
  env: LaunchEnvironment = process.env,
): LaunchPolicy {
  const activation = env.MONETIZATION_ACTIVATION_MODE?.trim() || "FREE_ONLY";
  if (activation !== "FREE_ONLY") throw new Error("LAUNCH_POLICY_ACTIVATION_MODE_INVALID");

  const hasExplicitSchedule = Boolean(
    env.LAUNCH_FREE_AT &&
      env.LAUNCH_PAID_PRENOTICE_AT &&
      env.LAUNCH_DISCOUNTED_PAID_AT &&
      env.LAUNCH_STANDARD_PAID_AT,
  );
  if (env.NODE_ENV === "production" && !hasExplicitSchedule) {
    throw new Error("LAUNCH_POLICY_SCHEDULE_REQUIRED");
  }
  const schedule = hasExplicitSchedule ? parseLaunchSchedule(env) : LOCAL_LAUNCH_SCHEDULE;
  const policy = resolveLaunchPolicy({ now, schedule, monetizationActivation: "FREE_ONLY" });
  return env.NODE_ENV === "production" ? policy : { ...policy, operationsAvailable: true };
}

export function assertLaunchOperationsAvailable(policy: LaunchPolicy): void {
  if (!policy.operationsAvailable) throw new Error("LAUNCH_OPERATIONS_NOT_AVAILABLE");
}

export function getKstDayWindow(now: Date): { start: Date; end: Date } {
  if (Number.isNaN(now.getTime())) throw new Error("LAUNCH_POLICY_NOW_INVALID");
  const offset = 9 * 60 * 60 * 1_000;
  const start = new Date(Math.floor((now.getTime() + offset) / 86_400_000) * 86_400_000 - offset);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export type SiteAvailability = "PUBLIC" | "MAINTENANCE";

export function resolveRuntimeSiteAvailability(
  env: Pick<LaunchEnvironment, "NODE_ENV"> & { SITE_AVAILABILITY?: string } = process.env,
): SiteAvailability {
  const value = env.SITE_AVAILABILITY?.trim().toUpperCase();
  if (value === "PUBLIC" || value === "MAINTENANCE") return value;
  return env.NODE_ENV === "production" ? "MAINTENANCE" : "PUBLIC";
}
