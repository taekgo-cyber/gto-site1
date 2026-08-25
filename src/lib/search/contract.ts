export const SEARCH_DOMAINS = ["JOBS", "LEASE", "BLOG"] as const;

export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE = 5;
export const SEARCH_SOURCE_CANDIDATE_LIMIT = 80;

export type UnifiedSearchRequest = {
  query: string;
  domains: SearchDomain[];
  page: number;
  pageSize: typeof SEARCH_PAGE_SIZE;
};

export type SearchMatchKind =
  | "TITLE_EXACT"
  | "TITLE_PREFIX"
  | "TITLE_CONTAINS"
  | "BODY_CONTAINS";

/**
 * Public search response item. Source rows may contain body text for ranking,
 * but only this allow-listed projection may cross the search boundary.
 */
export type UnifiedSearchItem = {
  id: string;
  domain: SearchDomain;
  title: string;
  excerpt: string | null;
  href: string;
  context: string | null;
  publishedAt: Date;
  matchedOn: SearchMatchKind;
};

export type UnifiedSearchPage = {
  query: string;
  domains: SearchDomain[];
  items: UnifiedSearchItem[];
  page: number;
  pageSize: typeof SEARCH_PAGE_SIZE;
  totalMatches: number;
  totalPages: number;
  candidateLimited: boolean;
};

/** Internal-only source shape used by deterministic ranking. */
export type SearchCandidate = {
  id: string;
  domain: SearchDomain;
  title: string;
  body: string | null;
  href: string;
  context: string | null;
  publishedAt: Date;
};
