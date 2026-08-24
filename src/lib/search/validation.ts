import {
  SEARCH_DOMAINS,
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  type SearchDomain,
  type UnifiedSearchRequest,
} from "./contract";

export type SearchParams = Record<string, string | string[] | undefined>;

const domainSet = new Set<string>(SEARCH_DOMAINS);

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function getSingleParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) throw new Error(`SEARCH_${key.toUpperCase()}_REPEATED`);
  return value;
}

function parseDomains(value: string | undefined): SearchDomain[] {
  if (value === undefined || value.trim() === "") return [...SEARCH_DOMAINS];

  const requested = new Set(
    value
      .split(",")
      .map((domain) => domain.trim().toUpperCase())
      .filter(Boolean),
  );
  if (requested.size === 0 || [...requested].some((domain) => !domainSet.has(domain))) {
    throw new Error("SEARCH_DOMAINS_INVALID");
  }

  return SEARCH_DOMAINS.filter((domain) => requested.has(domain));
}

function parsePage(value: string | undefined): number {
  if (value === undefined || value === "") return 1;
  if (!/^\d+$/.test(value)) throw new Error("SEARCH_PAGE_INVALID");
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || page > SEARCH_MAX_PAGE) {
    throw new Error("SEARCH_PAGE_INVALID");
  }
  return page;
}

export function parseUnifiedSearchRequest(params: SearchParams): UnifiedSearchRequest {
  const rawQuery = getSingleParam(params, "q");
  if (rawQuery === undefined) throw new Error("SEARCH_QUERY_REQUIRED");

  const query = normalizeSearchText(rawQuery);
  if (query.length < SEARCH_QUERY_MIN_LENGTH || query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new Error("SEARCH_QUERY_INVALID");
  }

  return {
    query,
    domains: parseDomains(getSingleParam(params, "domains")),
    page: parsePage(getSingleParam(params, "page")),
    pageSize: SEARCH_PAGE_SIZE,
  };
}

