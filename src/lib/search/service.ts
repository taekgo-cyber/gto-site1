import {
  SEARCH_SOURCE_CANDIDATE_LIMIT,
  type SearchCandidate,
  type SearchDomain,
  type UnifiedSearchPage,
  type UnifiedSearchRequest,
} from "./contract";
import { rankSearchCandidates } from "./ranking";

export type SearchCandidateBatch = {
  domain: SearchDomain;
  candidates: SearchCandidate[];
};

export function createUnifiedSearchPage(
  request: UnifiedSearchRequest,
  batches: SearchCandidateBatch[],
): UnifiedSearchPage {
  const selectedDomains = new Set(request.domains);
  const selectedBatches = batches.filter((batch) => selectedDomains.has(batch.domain));
  const candidateLimited = selectedBatches.some(
    (batch) => batch.candidates.length > SEARCH_SOURCE_CANDIDATE_LIMIT,
  );
  const candidates = selectedBatches.flatMap((batch) =>
    batch.candidates.slice(0, SEARCH_SOURCE_CANDIDATE_LIMIT),
  );
  const ranked = rankSearchCandidates(request.query, candidates);
  const totalMatches = ranked.length;
  const totalPages = Math.min(
    Math.ceil(totalMatches / request.pageSize),
    5,
  );
  const offset = (request.page - 1) * request.pageSize;

  return {
    query: request.query,
    domains: request.domains,
    items: ranked.slice(offset, offset + request.pageSize),
    page: request.page,
    pageSize: request.pageSize,
    totalMatches,
    totalPages,
    candidateLimited,
  };
}
