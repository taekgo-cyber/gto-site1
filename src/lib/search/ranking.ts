import type {
  SearchCandidate,
  SearchDomain,
  SearchMatchKind,
  UnifiedSearchItem,
} from "./contract";
import { normalizeSearchText } from "./validation";

const DOMAIN_ORDER: Record<SearchDomain, number> = {
  JOBS: 0,
  LEASE: 1,
  BLOG: 2,
};

const MATCH_SCORE: Record<SearchMatchKind, number> = {
  TITLE_EXACT: 100,
  TITLE_PREFIX: 80,
  TITLE_CONTAINS: 60,
  BODY_CONTAINS: 30,
};

type RankedCandidate = {
  item: UnifiedSearchItem;
  score: number;
};

function comparable(value: string): string {
  return normalizeSearchText(value).toLowerCase();
}

function matchKind(query: string, candidate: SearchCandidate): SearchMatchKind | null {
  const normalizedTitle = comparable(candidate.title);
  if (normalizedTitle === query) return "TITLE_EXACT";
  if (normalizedTitle.startsWith(query)) return "TITLE_PREFIX";
  if (normalizedTitle.includes(query)) return "TITLE_CONTAINS";
  if (candidate.body && comparable(candidate.body).includes(query)) return "BODY_CONTAINS";
  return null;
}

export function createSearchExcerpt(body: string | null, maxLength = 180): string | null {
  if (!body) return null;
  const normalized = normalizeSearchText(body);
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function rankSearchCandidates(queryInput: string, candidates: SearchCandidate[]): UnifiedSearchItem[] {
  const query = comparable(queryInput);
  const ranked: RankedCandidate[] = [];

  for (const candidate of candidates) {
    const matchedOn = matchKind(query, candidate);
    if (!matchedOn) continue;
    ranked.push({
      score: MATCH_SCORE[matchedOn],
      item: {
        id: candidate.id,
        domain: candidate.domain,
        title: candidate.title,
        excerpt: createSearchExcerpt(candidate.body),
        href: candidate.href,
        context: candidate.context,
        publishedAt: candidate.publishedAt,
        matchedOn,
      },
    });
  }

  return ranked
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      const publishedOrder = right.item.publishedAt.getTime() - left.item.publishedAt.getTime();
      if (publishedOrder !== 0) return publishedOrder;
      const domainOrder = DOMAIN_ORDER[left.item.domain] - DOMAIN_ORDER[right.item.domain];
      if (domainOrder !== 0) return domainOrder;
      return left.item.id.localeCompare(right.item.id);
    })
    .map(({ item }) => item);
}

