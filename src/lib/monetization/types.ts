import type { RecruitmentTier } from "./policy";

export type CreditPackageCatalogEntry = {
  code: string;
  displayName: string;
  priceKrw: number;
  creditAmount: number;
  status: "ACTIVE" | "INACTIVE";
};

export type ActiveCompanyEntitlement = {
  companyId: string;
  recruitmentTier: Exclude<RecruitmentTier, "NONE">;
  validFrom: Date;
  expiresAt: Date | null;
};

export type ProductRecruitmentEntitlementDefinition = {
  productId: string;
  recruitmentTier: Exclude<RecruitmentTier, "NONE">;
  weeklyMatchQuota: number;
};
