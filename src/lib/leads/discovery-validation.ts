import type { LeadDiscoveryFilters } from "./dal";

const WORK_TYPES = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY", "FREELANCE"]);

export function parseLeadDiscoveryQuery(input: URLSearchParams): {
  companyId: string | null;
  page: number;
  pageSize: number;
  filters: LeadDiscoveryFilters;
} {
  const positiveInteger = (key: string) => {
    const value = input.get(key);
    if (!value) return undefined;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : undefined;
  };
  const boolean = (key: string) => {
    const value = input.get(key);
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };
  const date = (key: string) => {
    const value = input.get(key);
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };
  const page = Math.max(1, positiveInteger("page") ?? 1);
  const pageSize = Math.min(50, Math.max(1, positiveInteger("pageSize") ?? 20));
  const workType = input.get("desiredWorkType") ?? undefined;
  return {
    companyId: input.get("companyId"),
    page,
    pageSize,
    filters: {
      preferredRegionId: input.get("preferredRegionId") || undefined,
      vehicleTypeId: input.get("vehicleTypeId") || undefined,
      tonnageId: input.get("tonnageId") || undefined,
      minExperienceYears: positiveInteger("minExperienceYears"),
      leaseExperience: boolean("leaseExperience"),
      vehicleOwned: boolean("vehicleOwned"),
      desiredWorkType: workType && WORK_TYPES.has(workType) ? workType : undefined,
      availableFromBefore: date("availableFromBefore"),
    },
  };
}
