import type { CbtOption } from "./types";

/**
 * Fisher-Yates 셔플. 원본 배열은 변경하지 않는다.
 * 서버 컴포넌트에서 문제/보기 순서를 랜덤화할 때 사용한다.
 */
export function shuffleArray<T>(array: readonly T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * 보기 표시 순서만 셔플한다. 각 보기의 원본 id/text는 그대로 유지한다.
 * DB의 options/correctOption 원본 데이터는 변경하지 않는다.
 */
export function shuffleQuestionOptions<T extends CbtOption>(
  options: readonly T[],
): T[] {
  return shuffleArray(options);
}

/**
 * 화면 표시 순서(1부터 시작)를 기준으로 특정 optionId의 표시 번호를 찾는다.
 * 채점 결과의 correctOption(원본 id)을 사용자가 보는 번호로 역매핑할 때 사용한다.
 * 없으면 null을 반환한다.
 */
export function getDisplayIndexOfOption(
  options: readonly CbtOption[],
  optionId: number,
): number | null {
  const index = options.findIndex((option) => option.id === optionId);
  return index === -1 ? null : index + 1;
}
