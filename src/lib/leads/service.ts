import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  LEAD_CONSENT_VERSION,
  LEAD_POLICY_VERSION,
  LEAD_ENTITLEMENT_SOURCE_FREE_MVP,
  assertUnlockCapacity,
  type LeadPolicy,
} from "./constants";
import { resolveActiveCompanyActor, canMatchOrUnlock } from "./authorization";
import type { CandidateLeadStatus, LeadCloseReason } from "./types";
import {
  canTransitionLeadStatus,
  isInactiveByExpiry,
  validateConsentForActivation,
  validateLeadForActivation,
  validateLeadInput,
} from "./validation";
import type { LeadEntitlementAdapter } from "./entitlement";
import { FreeMvpEntitlementAdapter } from "./entitlement";
import { toPreUnlockDto, toUnlockedContactDto, toUnlockedDto, type UnlockedContactDto } from "./dto";

// ---------------------------------------------------------------------------
// Lead lifecycle service (prisma-backed)
// ---------------------------------------------------------------------------

export async function createCandidateLead(input: {
  userId: string;
  data: {
    preferredRegionId?: string | null;
    vehicleTypeId?: string | null;
    tonnageId?: string | null;
    experienceYears?: number | null;
    leaseExperience?: boolean | null;
    vehicleOwned?: boolean | null;
    licenseInfo?: string | null;
    desiredWorkType?: string | null;
    desiredIncomeMin?: number | null;
    desiredIncomeMax?: number | null;
    availableFrom?: Date | null;
    careerSummary?: string | null;
    consentVersion?: string | null;
    consentedAt?: Date | null;
    expiresAt?: Date | null;
  };
}) {
  validateLeadInput(input.data as unknown as import("./types").CandidateLeadInput);
  if (input.data.consentVersion != null && input.data.consentVersion !== LEAD_CONSENT_VERSION) {
    throw new Error("consentVersion invalid");
  }
  // Guard non-terminal limit (application level + partial unique index)
  const count = await prisma.candidateLead.count({
    where: { userId: input.userId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } },
  });
  if (count >= 1) {
    throw new Error("User already has non-terminal lead");
  }
  return prisma.candidateLead.create({
    data: {
      userId: input.userId,
      status: "DRAFT",
      preferredRegionId: input.data.preferredRegionId ?? null,
      vehicleTypeId: input.data.vehicleTypeId ?? null,
      tonnageId: input.data.tonnageId ?? null,
      experienceYears: input.data.experienceYears ?? null,
      leaseExperience: input.data.leaseExperience ?? null,
      vehicleOwned: input.data.vehicleOwned ?? null,
      licenseInfo: input.data.licenseInfo ?? null,
      desiredWorkType: input.data.desiredWorkType as never,
      desiredIncomeMin: input.data.desiredIncomeMin ?? null,
      desiredIncomeMax: input.data.desiredIncomeMax ?? null,
      availableFrom: input.data.availableFrom ?? null,
      careerSummary: input.data.careerSummary ?? null,
      consentVersion: input.data.consentVersion ?? null,
      consentedAt: input.data.consentedAt ?? null,
      expiresAt: input.data.expiresAt ?? null,
    },
  });
}

type MutableLeadData = Omit<import("./types").CandidateLeadInput, "consentVersion" | "consentedAt">;

function leadDataForValidation(data: MutableLeadData, consentVersion?: string | null, consentedAt?: Date | null) {
  return { ...data, consentVersion: consentVersion ?? null, consentedAt: consentedAt ?? null };
}

function leadPatch(data: MutableLeadData) {
  return {
    preferredRegionId: data.preferredRegionId ?? null,
    vehicleTypeId: data.vehicleTypeId ?? null,
    tonnageId: data.tonnageId ?? null,
    experienceYears: data.experienceYears ?? null,
    leaseExperience: data.leaseExperience ?? null,
    vehicleOwned: data.vehicleOwned ?? null,
    licenseInfo: data.licenseInfo ?? null,
    desiredWorkType: data.desiredWorkType as never,
    desiredIncomeMin: data.desiredIncomeMin ?? null,
    desiredIncomeMax: data.desiredIncomeMax ?? null,
    availableFrom: data.availableFrom ?? null,
    careerSummary: data.careerSummary?.trim() || null,
    expiresAt: data.expiresAt ?? null,
  };
}

function mutableLeadDataFromRecord(lead: {
  preferredRegionId: string | null;
  vehicleTypeId: string | null;
  tonnageId: string | null;
  experienceYears: number | null;
  leaseExperience: boolean | null;
  vehicleOwned: boolean | null;
  licenseInfo: string | null;
  desiredWorkType: string | null;
  desiredIncomeMin: number | null;
  desiredIncomeMax: number | null;
  availableFrom: Date | null;
  careerSummary: string | null;
  expiresAt: Date | null;
}): MutableLeadData {
  return {
    preferredRegionId: lead.preferredRegionId,
    vehicleTypeId: lead.vehicleTypeId,
    tonnageId: lead.tonnageId,
    experienceYears: lead.experienceYears,
    leaseExperience: lead.leaseExperience,
    vehicleOwned: lead.vehicleOwned,
    licenseInfo: lead.licenseInfo,
    desiredWorkType: lead.desiredWorkType as never,
    desiredIncomeMin: lead.desiredIncomeMin,
    desiredIncomeMax: lead.desiredIncomeMax,
    availableFrom: lead.availableFrom,
    careerSummary: lead.careerSummary,
    expiresAt: lead.expiresAt,
  };
}

async function requireOwnedLead(leadId: string, userId: string) {
  const lead = await prisma.candidateLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (lead.userId !== userId) throw new Error("Forbidden: lead owner required");
  return lead;
}

export async function updateCandidateLead(input: {
  userId: string;
  leadId: string;
  data: MutableLeadData;
}) {
  const lead = await requireOwnedLead(input.leadId, input.userId);
  if (lead.status === "CLOSED" || lead.status === "EXPIRED") {
    throw new Error("Terminal lead cannot be edited");
  }
  validateLeadInput(leadDataForValidation(input.data, lead.consentVersion, lead.consentedAt));
  return prisma.candidateLead.update({ where: { id: lead.id }, data: leadPatch(input.data) });
}

export async function activateCandidateLead(input: {
  userId: string;
  leadId: string;
  data?: MutableLeadData;
  consentVersion: string;
}) {
  const lead = await requireOwnedLead(input.leadId, input.userId);
  if (lead.status !== "DRAFT") throw new Error("Only DRAFT lead can be activated");

  const consentedAt = new Date();
  const data = input.data ?? mutableLeadDataFromRecord(lead);
  const validationInput = leadDataForValidation(data, input.consentVersion, consentedAt);
  validateLeadForActivation(validationInput);
  validateConsentForActivation({ consentVersion: input.consentVersion, consentedAt });

  return prisma.$transaction(async (tx) => {
    const current = await tx.candidateLead.findUnique({ where: { id: input.leadId } });
    if (!current || current.userId !== input.userId) throw new Error("Forbidden: lead owner required");
    if (current.status !== "DRAFT") throw new Error("Only DRAFT lead can be activated");

    return tx.candidateLead.update({
      where: { id: current.id },
      data: {
        ...leadPatch(data),
        status: "ACTIVE",
        consentVersion: LEAD_CONSENT_VERSION,
        consentedAt,
      },
    });
  });
}

export async function transitionOwnedLeadStatus(input: {
  userId: string;
  leadId: string;
  targetStatus: CandidateLeadStatus;
  closeReason?: LeadCloseReason | null;
  now?: Date;
}) {
  const lead = await requireOwnedLead(input.leadId, input.userId);
  if (lead.status === "CLOSED" || lead.status === "EXPIRED") {
    throw new Error("Terminal lead cannot be reactivated");
  }
  return transitionLeadStatus({
    leadId: lead.id,
    targetStatus: input.targetStatus,
    closeReason: input.closeReason,
    now: input.now,
  });
}

export async function transitionLeadStatus(input: {
  leadId: string;
  targetStatus: CandidateLeadStatus;
  closeReason?: LeadCloseReason | null;
  now?: Date;
}): Promise<import("@/generated/prisma/client").CandidateLead> {
  const lead = await prisma.candidateLead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error("Lead not found");
  const from = lead.status as CandidateLeadStatus;
  const to = input.targetStatus;
  const now = input.now ?? new Date();

  if ((from === "ACTIVE" || from === "PAUSED") && isInactiveByExpiry(lead.expiresAt, now) && to !== "EXPIRED") {
    await prisma.candidateLead.update({ where: { id: lead.id }, data: { status: "EXPIRED" } });
    throw new Error("Lead expired");
  }

  if (!canTransitionLeadStatus(from, to)) {
    throw new Error(`Invalid transition ${from} -> ${to}`);
  }

  // Activation requires consent
  if (from === "DRAFT" && to === "ACTIVE") {
    validateLeadForActivation({
      preferredRegionId: lead.preferredRegionId,
      vehicleTypeId: lead.vehicleTypeId,
      tonnageId: lead.tonnageId,
      experienceYears: lead.experienceYears,
      leaseExperience: lead.leaseExperience,
      vehicleOwned: lead.vehicleOwned,
      licenseInfo: lead.licenseInfo,
      desiredWorkType: lead.desiredWorkType as never,
      desiredIncomeMin: lead.desiredIncomeMin,
      desiredIncomeMax: lead.desiredIncomeMax,
      availableFrom: lead.availableFrom,
      careerSummary: lead.careerSummary,
      consentVersion: lead.consentVersion,
      consentedAt: lead.consentedAt,
      expiresAt: lead.expiresAt,
    });
    validateConsentForActivation({ consentVersion: lead.consentVersion, consentedAt: lead.consentedAt });
  }

  // CloseReason handling
  if (to === "CLOSED") {
    if (!input.closeReason || !["HIRED", "USER_CLOSED", "ADMIN_CLOSED"].includes(input.closeReason)) {
      throw new Error("closeReason required for CLOSED");
    }
  } else if (input.closeReason) {
    throw new Error("closeReason only allowed for CLOSED");
  }

  // If already expired by time, normalize before transition? For ACTIVE/PAUSED->EXPIRED transactional
  if (to === "EXPIRED") {
    if (!isInactiveByExpiry(lead.expiresAt, input.now ?? new Date())) {
      throw new Error("Lead not expired yet");
    }
  }

  return prisma.candidateLead.update({
    where: { id: input.leadId },
    data: {
      status: to,
      pausedAt: to === "PAUSED" ? now : from === "PAUSED" && to === "ACTIVE" ? null : undefined,
      closedAt: to === "CLOSED" ? now : undefined,
      closeReason: to === "CLOSED" ? input.closeReason : undefined,
    },
  });
}

// Effective active check for discovery/match/unlock
export function isLeadEffectivelyActive(lead: {
  status: CandidateLeadStatus;
  expiresAt: Date | null;
  consentVersion: string | null;
  consentedAt: Date | null;
}): boolean {
  if (lead.status !== "ACTIVE") return false;
  if (isInactiveByExpiry(lead.expiresAt)) return false;
  if (lead.consentVersion !== LEAD_CONSENT_VERSION) return false;
  if (!lead.consentedAt || Number.isNaN(lead.consentedAt.getTime())) return false;
  return true;
}

// Match creation idempotent
export async function createLeadMatch(input: {
  companyId: string;
  leadId: string;
  actorUserId: string;
  entitlementAdapter?: LeadEntitlementAdapter;
}) {
  // Authorization
  const auth = await resolveActiveCompanyActor(input.actorUserId, input.companyId);
  if (!auth.ok) throw new Error(auth.message);
  if (!canMatchOrUnlock(auth.actor)) throw new Error("Forbidden: match requires OWNER or MANAGER");

  // Lead effectiveness
  const lead = await prisma.candidateLead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error("Lead not found");
  // normalize expiry transactionally
  if (isInactiveByExpiry(lead.expiresAt) && (lead.status === "ACTIVE" || lead.status === "PAUSED")) {
    await prisma.candidateLead.update({ where: { id: lead.id }, data: { status: "EXPIRED" } });
    throw new Error("Lead expired");
  }
  if (!isLeadEffectivelyActive(lead as never)) throw new Error("Lead not active");

  // Consent
  validateConsentForActivation({ consentVersion: lead.consentVersion, consentedAt: lead.consentedAt });

  // Cap policy required – FREE_MVP always passes but we assert policy exists
  if (!LEAD_POLICY_VERSION) throw new Error("cap policy not configured");

  // Fast idempotency path; the transaction below closes the same-pair race.
  const existing = await prisma.leadMatch.findUnique({
    where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
  });
  if (existing?.status === "ACTIVE") return existing;

  // Entitlement advisory check (optional)
  const adapter = input.entitlementAdapter ?? new FreeMvpEntitlementAdapter();
  const check = await adapter.checkLeadUnlockEntitlement({
    companyId: input.companyId,
    leadId: input.leadId,
    actorUserId: input.actorUserId,
  });
  if (!check.allowed) throw new Error(check.reason ?? "entitlement denied");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "candidate_leads" WHERE "id" = ${input.leadId} FOR UPDATE`);
    const current = await tx.leadMatch.findUnique({
      where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
    });
    if (current?.status === "ACTIVE") return current;
    if (current?.status === "CANCELLED") {
      return tx.leadMatch.update({ where: { id: current.id }, data: { status: "ACTIVE", actorUserId: input.actorUserId } });
    }
    return tx.leadMatch.create({
      data: {
        companyId: input.companyId,
        leadId: input.leadId,
        actorUserId: input.actorUserId,
        status: "ACTIVE",
      },
    });
  });
}

export async function cancelLeadMatch(input: {
  companyId: string;
  leadId: string;
  actorUserId: string;
}) {
  const auth = await resolveActiveCompanyActor(input.actorUserId, input.companyId);
  if (!auth.ok) throw new Error(auth.message);
  if (!canMatchOrUnlock(auth.actor)) throw new Error("Forbidden: match requires OWNER or MANAGER");

  const existing = await prisma.leadMatch.findUnique({
    where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
  });
  if (!existing) throw new Error("LeadMatch not found");
  if (existing.status === "CANCELLED") return existing;
  return prisma.leadMatch.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", actorUserId: input.actorUserId },
  });
}

// Unlock requires effective active Lead, valid consent, OWNER/MANAGER, ACTIVE LeadMatch, cap policy, authoritative consume. Idempotent.
export async function unlockLeadContact(input: {
  companyId: string;
  leadId: string;
  actorUserId: string;
  entitlementAdapter: LeadEntitlementAdapter;
  policy: LeadPolicy;
}) {
  const auth = await resolveActiveCompanyActor(input.actorUserId, input.companyId);
  if (!auth.ok) throw new Error(auth.message);
  if (!canMatchOrUnlock(auth.actor)) throw new Error("Forbidden: unlock requires OWNER or MANAGER");

  assertUnlockCapacity(0, input.policy);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "candidate_leads" WHERE "id" = ${input.leadId} FOR UPDATE`);

    const lead = await tx.candidateLead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new Error("Lead not found");
    if (isInactiveByExpiry(lead.expiresAt) && (lead.status === "ACTIVE" || lead.status === "PAUSED")) {
      await tx.candidateLead.update({ where: { id: lead.id }, data: { status: "EXPIRED" } });
      throw new Error("Lead expired");
    }
    if (!isLeadEffectivelyActive(lead as never)) throw new Error("Lead not active for unlock");
    validateConsentForActivation({ consentVersion: lead.consentVersion, consentedAt: lead.consentedAt });

    const match = await tx.leadMatch.findUnique({
      where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
    });
    if (!match || match.status !== "ACTIVE") throw new Error("LeadMatch required");

    const existingUnlock = await tx.leadContactUnlock.findUnique({
      where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
    });
    if (existingUnlock) {
      const user = await tx.user.findUnique({ where: { id: lead.userId }, select: { name: true, phone: true } });
      if (!user) throw new Error("Lead owner not found");
      return {
        unlock: existingUnlock,
        dto: toUnlockedDto({ lead: lead as never, user, entitlementSource: existingUnlock.entitlementSource, policyVersion: existingUnlock.policyVersion }),
        contact: toUnlockedContactDto(user),
        alreadyUnlocked: true,
      };
    }

    const unlockCount = await tx.leadContactUnlock.count({ where: { leadId: input.leadId } });
    assertUnlockCapacity(unlockCount, input.policy);

    const idempotencyKey = `lead-contact-unlock:${input.companyId}:${input.leadId}`;
    const consume = await input.entitlementAdapter.consumeLeadUnlockEntitlement({
      companyId: input.companyId,
      leadId: input.leadId,
      actorUserId: input.actorUserId,
      idempotencyKey,
    });
    if (!consume.consumed && !consume.alreadyConsumed) throw new Error("entitlement consume failed");

    const unlock = await tx.leadContactUnlock.create({
      data: {
        companyId: input.companyId,
        leadId: input.leadId,
        actorUserId: input.actorUserId,
        entitlementSource: consume.entitlementSource ?? LEAD_ENTITLEMENT_SOURCE_FREE_MVP,
        policyVersion: consume.policyVersion ?? input.policy.policyVersion ?? LEAD_POLICY_VERSION,
        consentVersion: lead.consentVersion!,
      },
    });
    const user = await tx.user.findUnique({ where: { id: lead.userId }, select: { name: true, phone: true } });
    if (!user) throw new Error("Lead owner not found");
    return {
      unlock,
      dto: toUnlockedDto({ lead: lead as never, user, entitlementSource: unlock.entitlementSource, policyVersion: unlock.policyVersion }),
      contact: toUnlockedContactDto(user),
      alreadyUnlocked: false,
    };
  });
}

export async function readUnlockedLeadContact(input: {
  companyId: string;
  leadId: string;
  actorUserId: string;
}): Promise<{ unlock: import("@/generated/prisma/client").LeadContactUnlock; contact: UnlockedContactDto }> {
  const auth = await resolveActiveCompanyActor(input.actorUserId, input.companyId);
  if (!auth.ok) throw new Error(auth.message);
  if (!canMatchOrUnlock(auth.actor)) throw new Error("Forbidden: unlock requires OWNER or MANAGER");

  const lead = await prisma.candidateLead.findUnique({ where: { id: input.leadId } });
  if (!lead || !isLeadEffectivelyActive(lead as never)) throw new Error("Lead not active for unlock");
  validateConsentForActivation({ consentVersion: lead.consentVersion, consentedAt: lead.consentedAt });

  const match = await prisma.leadMatch.findUnique({
    where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
  });
  if (!match || match.status !== "ACTIVE") throw new Error("LeadMatch required");

  const unlock = await prisma.leadContactUnlock.findUnique({
    where: { companyId_leadId: { companyId: input.companyId, leadId: input.leadId } },
  });
  if (!unlock) throw new Error("Lead contact is not unlocked");

  const user = await prisma.user.findUnique({ where: { id: lead.userId }, select: { name: true, phone: true } });
  if (!user) throw new Error("Lead owner not found");
  return { unlock, contact: toUnlockedContactDto(user) };
}

// DTO helpers re-export for server usage
export { toPreUnlockDto, toUnlockedContactDto, toUnlockedDto };
