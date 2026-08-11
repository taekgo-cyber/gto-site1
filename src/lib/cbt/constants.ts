// 화물운송종사자격시험 모의고사 설정.
// 통상적으로 알려진 기준(과목당 20문항·총 80문항·100점 만점에 60점 이상 합격·과목별 40점 미만 과락)을
// 기본값으로 두고, 실제 출제 기준이 확인되면 이 파일의 숫자만 조정한다.
export type CbtExamConfig = {
  /** 과목당 출제 문항 수 (가용 문항이 부족하면 있는 만큼만 사용) */
  questionsPerSubject: number;
  /** 모의고사 최소 구성 문항 수. 이보다 부족하면 "준비 중" 안내 */
  minExamQuestions: number;
  /** 100점 만점 기준 합격선 */
  passScore: number;
  /** 100점 만점 기준 과목별 과락선 (미만이면 과락) */
  minSubjectScore: number;
  /** 제한 시간(분) */
  timeLimitMinutes: number;
  /** 서버가 허용하는 답안 최대 개수 (payload 방어) */
  maxSubmitAnswers: number;
};

export const CBT_EXAM_CONFIG: CbtExamConfig = {
  questionsPerSubject: 20,
  minExamQuestions: 4,
  passScore: 60,
  minSubjectScore: 40,
  timeLimitMinutes: 80,
  maxSubmitAnswers: 200,
};
