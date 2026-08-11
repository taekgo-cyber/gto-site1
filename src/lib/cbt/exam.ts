import { CBT_EXAM_CONFIG, type CbtExamConfig } from "./constants";
import { parseCbtOptions } from "./options";
import { shuffleArray } from "./shuffle";
import type { PublicCbtQuestion } from "./types";

/**
 * 채점에 필요한 문제 정보. 클라이언트로 전달하지 않는 데이터를 포함한다.
 */
export type GradingQuestion = {
  id: string;
  categoryId: string;
  subject: string;
  status: string;
  options: unknown;
  correctOption: number;
  explanation: string | null;
};

/** questionId -> 선택한 optionId */
export type ExamAnswerMap = Record<string, number>;

export type GradedExamAnswer = {
  questionId: string;
  subject: string;
  selectedOptionId: number | null;
  correctOption: number;
  isCorrect: boolean;
  explanation: string | null;
};

export type SubjectExamResult = {
  subject: string;
  total: number;
  correct: number;
  score: number;
};

export type ExamGradeResult = {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  score: number;
  passed: boolean;
  subjectResults: SubjectExamResult[];
  results: GradedExamAnswer[];
};

/**
 * 모의고사 시험 세트를 구성한다.
 * - 문제 순서는 랜덤화한다 (원본 DB 순서는 변경하지 않는다).
 * - 과목별로 config.questionsPerSubject만큼만 추출한다.
 * - 가용 문항이 과목 quota보다 적으면 있는 만큼만 사용한다.
 * - 전체 문항이 minExamQuestions 미만이면 호출부에서 "준비 중"을 처리한다.
 */
export function buildExamSet(
  questions: readonly PublicCbtQuestion[],
  config: CbtExamConfig = CBT_EXAM_CONFIG,
): PublicCbtQuestion[] {
  const shuffled = shuffleArray(questions);

  const bySubject = new Map<string, PublicCbtQuestion[]>();
  for (const question of shuffled) {
    const list = bySubject.get(question.subject);
    if (list) list.push(question);
    else bySubject.set(question.subject, [question]);
  }

  const selected: PublicCbtQuestion[] = [];
  for (const list of bySubject.values()) {
    selected.push(...list.slice(0, config.questionsPerSubject));
  }

  return shuffleArray(selected);
}

function roundScore(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

/**
 * 서버 메모리에서 답안을 일괄 채점한다 (N+1 없음).
 * - 미응답은 오답(0점) 처리한다.
 * - 합격 조건: 총점 >= passScore AND 각 과목(문항 존재 시) 점수 >= minSubjectScore
 */
export function gradeExamAnswers(
  questions: readonly GradingQuestion[],
  answers: ExamAnswerMap,
  config: CbtExamConfig = CBT_EXAM_CONFIG,
): ExamGradeResult {
  const results: GradedExamAnswer[] = questions.map((question) => {
    const selectedOptionId = answers[question.id] ?? null;
    const optionIds = parseCbtOptions(question.options).map(
      (option) => option.id,
    );
    const isCorrect =
      selectedOptionId !== null &&
      optionIds.includes(selectedOptionId) &&
      selectedOptionId === question.correctOption;

    return {
      questionId: question.id,
      subject: question.subject,
      selectedOptionId,
      correctOption: question.correctOption,
      isCorrect,
      explanation: question.explanation,
    };
  });

  const totalQuestions = results.length;
  const correctCount = results.filter((result) => result.isCorrect).length;
  const unansweredCount = results.filter(
    (result) => result.selectedOptionId === null,
  ).length;
  const wrongCount = totalQuestions - correctCount;
  const score = roundScore(correctCount, totalQuestions);

  const bySubject = new Map<string, GradedExamAnswer[]>();
  for (const result of results) {
    const list = bySubject.get(result.subject);
    if (list) list.push(result);
    else bySubject.set(result.subject, [result]);
  }

  const subjectResults: SubjectExamResult[] = Array.from(bySubject.entries()).map(
    ([subject, list]) => ({
      subject,
      total: list.length,
      correct: list.filter((result) => result.isCorrect).length,
      score: roundScore(
        list.filter((result) => result.isCorrect).length,
        list.length,
      ),
    }),
  );

  const subjectPassed = subjectResults.every(
    (subject) => subject.total === 0 || subject.score >= config.minSubjectScore,
  );
  const passed =
    totalQuestions > 0 && score >= config.passScore && subjectPassed;

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    score,
    passed,
    subjectResults,
    results,
  };
}
