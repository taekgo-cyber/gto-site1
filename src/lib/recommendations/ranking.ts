import {
  RECOMMENDATION_RESULT_LIMIT,
  type PublicRecommendationItem,
  type RecommendationCandidate,
  type RecommendationDomain,
} from "./contract";

const DOMAIN_ORDER: Record<RecommendationDomain, number> = {
  JOBS: 0,
  LEASE: 1,
};

export function rankRecommendations(
  candidates: RecommendationCandidate[],
  limit = RECOMMENDATION_RESULT_LIMIT,
): PublicRecommendationItem[] {
  return [...candidates]
    .filter((candidate) => candidate.reasons.length > 0)
    .sort((left, right) => {
      if (left.reasons.length !== right.reasons.length) {
        return right.reasons.length - left.reasons.length;
      }
      const publishedOrder = right.publishedAt.getTime() - left.publishedAt.getTime();
      if (publishedOrder !== 0) return publishedOrder;
      const domainOrder = DOMAIN_ORDER[left.domain] - DOMAIN_ORDER[right.domain];
      if (domainOrder !== 0) return domainOrder;
      return left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(0, limit));
}
