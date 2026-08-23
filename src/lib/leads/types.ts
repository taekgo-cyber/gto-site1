export type CandidateLeadStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED" | "EXPIRED";
export type LeadCloseReason = "HIRED" | "USER_CLOSED" | "ADMIN_CLOSED";
export type LeadMatchStatus = "ACTIVE" | "CANCELLED";

export type CandidateLeadInput = {
  preferredRegionId?: string | null;
  vehicleTypeId?: string | null;
  tonnageId?: string | null;
  experienceYears?: number | null;
  leaseExperience?: boolean | null;
  vehicleOwned?: boolean | null;
  licenseInfo?: string | null;
  desiredWorkType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE" | null;
  desiredIncomeMin?: number | null;
  desiredIncomeMax?: number | null;
  availableFrom?: Date | string | null;
  careerSummary?: string | null;
  consentVersion?: string | null;
  consentedAt?: Date | string | null;
  expiresAt?: Date | string | null;
};

export type CandidateLeadRecord = {
  id: string;
  userId: string;
  status: CandidateLeadStatus;
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
  consentVersion: string | null;
  consentedAt: Date | null;
  expiresAt: Date | null;
  pausedAt: Date | null;
  closedAt: Date | null;
  closeReason: LeadCloseReason | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyActor = {
  userId: string;
  userStatus: "ACTIVE" | "SUSPENDED" | "WITHDRAWN";
  userRole: "USER" | "COMPANY" | "ADMIN";
  companyId: string;
  companyStatus: "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";
  memberRole: "OWNER" | "MANAGER" | "STAFF";
  memberStatus: "ACTIVE" | "REMOVED";
};
