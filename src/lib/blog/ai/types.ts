export const AI_CONTENT_SOURCE_TYPES = [
  "LEASE_POST",
  "REGION",
  "TONNAGE",
  "VEHICLE_TYPE",
  "COMPANY_PUBLIC",
  "CBT_CATEGORY",
  "BLOG_ARTICLE",
] as const;

export type AiContentSourceType = (typeof AI_CONTENT_SOURCE_TYPES)[number];

export type AiContentGenerationRequest = {
  topic: string;
  targetKeyword: string;
  sourceType: AiContentSourceType;
  sourceIds: string[];
  instruction?: string;
};

export type AiContentSource = {
  type: AiContentSourceType;
  id: string;
  label: string;
  facts: string[];
};

export type GeneratedBlogDraft = {
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  seoTitle: string | null;
  seoDescription: string | null;
  suggestedCategorySlug: string | null;
  tags: string[];
};

export type AiBlogProvider = {
  readonly provider: string;
  readonly model: string;
  generate(input: AiContentGenerationRequest, sources: AiContentSource[]): Promise<GeneratedBlogDraft>;
  getGenerationMetadata?(): Record<string, string | boolean | null>;
};

export type AiQualityIssue = {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
};

export type AiQualityReport = {
  ok: boolean;
  issues: AiQualityIssue[];
};

export type AiSourceOption = {
  id: string;
  label: string;
  detail?: string | null;
};
