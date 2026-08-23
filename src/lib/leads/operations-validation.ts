export const COMPANY_OPERATIONS_FILTERS = ["ALL", "ACTIVE", "CANCELLED", "UNLOCKED"] as const;
export type CompanyOperationsFilter = (typeof COMPANY_OPERATIONS_FILTERS)[number];

export function parseCompanyOperationsQuery(input: URLSearchParams): {
  page: number;
  pageSize: number;
  filter: CompanyOperationsFilter;
  companyId: string | null;
} {
  const rawPage = input.get("page");
  const rawPageSize = input.get("pageSize");
  const rawFilter = input.get("filter");
  const rawCompanyId = input.get("companyId");

  const pageNum = rawPage ? Number(rawPage) : 1;
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;

  const pageSizeNum = rawPageSize ? Number(rawPageSize) : 20;
  const pageSize = Number.isInteger(pageSizeNum) && pageSizeNum >= 1 ? Math.min(50, pageSizeNum) : 20;

  const filterUpper = rawFilter ? rawFilter.toUpperCase() : "ALL";
  const filter: CompanyOperationsFilter = (COMPANY_OPERATIONS_FILTERS as readonly string[]).includes(filterUpper)
    ? (filterUpper as CompanyOperationsFilter)
    : "ALL";

  return {
    page,
    pageSize,
    filter,
    companyId: rawCompanyId && rawCompanyId.trim() ? rawCompanyId.trim() : null,
  };
}

export function parseCandidateOperationsQuery(input: URLSearchParams): {
  page: number;
  pageSize: number;
} {
  const rawPage = input.get("page");
  const rawPageSize = input.get("pageSize");
  const pageNum = rawPage ? Number(rawPage) : 1;
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;
  const pageSizeNum = rawPageSize ? Number(rawPageSize) : 20;
  const pageSize = Number.isInteger(pageSizeNum) && pageSizeNum >= 1 ? Math.min(50, pageSizeNum) : 20;
  return { page, pageSize };
}
