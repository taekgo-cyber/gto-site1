export type CbtOption = {
  id: number;
  text: string;
};

export type PublicCbtQuestion = {
  id: string;
  subject: string;
  questionText: string;
  options: CbtOption[];
  imageUrl: string | null;
};

export type GradeResult = {
  isCorrect: boolean;
  correctOption: number;
  explanation: string | null;
};

export type CbtCategoryPublic = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  questionCount: number;
};

export type PracticeMode = "none" | "wrong" | "bookmark";
