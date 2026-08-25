export const RECOMMENDATION_DOMAINS = ["JOBS", "LEASE"] as const;

export type RecommendationDomain = (typeof RECOMMENDATION_DOMAINS)[number];
export type RecommendationSignal = "REGION" | "VEHICLE_TYPE" | "TONNAGE";

export type RecommendationReason = {
  signal: RecommendationSignal;
  label: string;
};

export type RecommendationCandidate = {
  id: string;
  domain: RecommendationDomain;
  title: string;
  href: string;
  context: string | null;
  publishedAt: Date;
  reasons: RecommendationReason[];
};

export type PublicRecommendationItem = RecommendationCandidate;

export type RecommendationSeed = {
  domain: RecommendationDomain;
  id: string;
};

export const RECOMMENDATION_SOURCE_LIMIT = 12;
export const RECOMMENDATION_RESULT_LIMIT = 4;
