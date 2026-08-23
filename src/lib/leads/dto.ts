import type { CandidateLeadRecord } from "./types";

// Pre-unlock DTO must exclude userId, name, phone, email, exact address and internal audit identifiers
export type PreUnlockLeadDto = {
  id: string;
  status: string;
  preferredRegion: { id: string; name: string } | null;
  vehicleType: { id: string; name: string } | null;
  tonnage: { id: string; name: string } | null;
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
  createdAt: Date;
  updatedAt: Date;
};

// Unlocked DTO reads only minimum User name/phone server-side and returns no contact when Lead is paused/closed/expired.
export type UnlockedLeadDto = PreUnlockLeadDto & {
  contact: { name: string; phone: string | null } | null;
};

export type UnlockedContactDto = {
  name: string;
  phone: string | null;
};

type LeadWithRelations = CandidateLeadRecord & {
  preferredRegion?: { id: string; name: string } | null;
  vehicleType?: { id: string; name: string } | null;
  tonnage?: { id: string; name: string } | null;
};

export function toPreUnlockDto(lead: LeadWithRelations): PreUnlockLeadDto {
  // Explicitly exclude userId, audit fields, and any PII
  // Do not leak clos* audit internals beyond status/expiresAt needed for UI
  return {
    id: lead.id,
    status: lead.status,
    preferredRegion: lead.preferredRegion ?? null,
    vehicleType: lead.vehicleType ?? null,
    tonnage: lead.tonnage ?? null,
    experienceYears: lead.experienceYears,
    leaseExperience: lead.leaseExperience,
    vehicleOwned: lead.vehicleOwned,
    licenseInfo: lead.licenseInfo,
    desiredWorkType: lead.desiredWorkType,
    desiredIncomeMin: lead.desiredIncomeMin,
    desiredIncomeMax: lead.desiredIncomeMax,
    availableFrom: lead.availableFrom,
    careerSummary: lead.careerSummary,
    expiresAt: lead.expiresAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

export function toUnlockedDto(input: {
  lead: LeadWithRelations;
  user: { name: string; phone: string | null };
  entitlementSource: string;
  policyVersion: string;
}): UnlockedLeadDto | PreUnlockLeadDto {
  const base = toPreUnlockDto(input.lead);
  // Return no contact when Lead is paused/closed/expired or effectively inactive by expiry
  const isInactive =
    input.lead.status === "PAUSED" ||
    input.lead.status === "CLOSED" ||
    input.lead.status === "EXPIRED" ||
    (input.lead.expiresAt ? input.lead.expiresAt.getTime() <= Date.now() : false);

  if (isInactive) {
    return { ...base, contact: null };
  }

  return {
    ...base,
    contact: { name: input.user.name, phone: input.user.phone },
  };
}

export function toUnlockedContactDto(user: { name: string; phone: string | null }): UnlockedContactDto {
  return { name: user.name, phone: user.phone };
}
