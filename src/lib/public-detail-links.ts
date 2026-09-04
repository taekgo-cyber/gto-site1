// Existing App Router entity IDs (CUID in the DB), not campaign IDs or slugs.
export const publicJobHref = (id: string) => `/jobs/${encodeURIComponent(id)}`;
export const publicLeaseHref = (id: string) => `/lease/${encodeURIComponent(id)}`;
export const publicCompanyHref = (id: string) => `/companies/${encodeURIComponent(id)}`;
