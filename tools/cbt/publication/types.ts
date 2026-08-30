export const CBT_PUBLICATION_CATEGORY_SLUG = "cargo-driver";
export const CBT_PUBLICATION_SOURCE = "master-question";
export const CBT_PUBLICATION_VERSION = 1;

export type PublicationTargetStatus = "DRAFT" | "PUBLISHED";
export type PublicationAction = "CREATE" | "PUBLISH" | "NO_OP" | "INVALID" | "CONFLICT";

export type PublicationCandidate = {
  id: string;
  sourceName: string;
  sourceQuestionId: string;
  originalUrl: string | null;
  contentFingerprint: string;
};

export type PublicationGeneratedQuestion = {
  id: string;
  status: string;
  candidateQuestionId: string;
  contentFingerprint: string | null;
  candidateQuestion: PublicationCandidate;
};

export type PublicationMaster = {
  id: string;
  generatedQuestionId: string;
  category: string;
  questionText: string;
  choices: unknown;
  answers: unknown;
  explanation: string | null;
  difficulty: string;
  isActive: boolean;
  publishedAt: Date | null;
  generatedQuestion: PublicationGeneratedQuestion;
};

export type PublicationCategory = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
};

export type PublicationMetadata = {
  canonical: true;
  publicationVersion: typeof CBT_PUBLICATION_VERSION;
  masterQuestionId: string;
  generatedQuestionId: string;
  candidateQuestionId: string;
  sourceName: string;
  sourceQuestionId: string;
  originalUrl: string | null;
  generatedContentFingerprint: string;
  candidateContentFingerprint: string;
  difficulty: string;
};

export type PublicationTarget = {
  id: string;
  categoryId: string;
  subject: string;
  questionText: string;
  options: unknown;
  correctOption: number;
  explanation: string | null;
  imageUrl: string | null;
  status: PublicationTargetStatus | "HIDDEN";
  source: string | null;
  metadata: unknown;
};

export type PublicationCreateInput = Omit<PublicationTarget, "status"> & {
  status: "DRAFT";
  metadata: PublicationMetadata;
};

export interface PublicationRepository {
  listMasters(ids: readonly string[] | null): Promise<PublicationMaster[]>;
  findCategoryBySlug(slug: string): Promise<PublicationCategory | null>;
  listTargets(ids: readonly string[]): Promise<PublicationTarget[]>;
  createTarget(input: PublicationCreateInput): Promise<PublicationTarget>;
  updateTargetStatus(id: string, status: "PUBLISHED"): Promise<PublicationTarget>;
}

export interface PublicationDatabase extends PublicationRepository {
  transaction<T>(work: (repository: PublicationRepository) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
}

export type PublicationPlanItem = {
  masterQuestionId: string;
  targetQuestionId: string;
  categoryCode: string | null;
  subject: string | null;
  action: PublicationAction;
  reasons: string[];
  expected: PublicationCreateInput | null;
};

export type PublicationPlan = {
  planId: string;
  selectedIds: string[] | null;
  selectedCount: number;
  selectedMasterCount: number;
  eligibleCount: number;
  wouldCreate: number;
  wouldPublish: number;
  wouldNoOp: number;
  wouldConflict: number;
  invalidCount: number;
  categoryDistribution: Record<string, number>;
  targetStatus: PublicationTargetStatus;
  dbWrite: false;
  items: PublicationPlanItem[];
};

export type PublicationExecutionResult = {
  plan: PublicationPlan;
  created: number;
  published: number;
  noOp: number;
  postWriteVerified: true;
};
