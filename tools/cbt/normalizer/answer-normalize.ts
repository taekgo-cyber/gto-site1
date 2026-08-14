// STEP 5 — 정답 문자열 → 숫자 정규화 (Session 10-1 STEP 5 §9/§10).
// 원칙: deterministic rule-based parser를 최우선으로 사용한다.
//   - 정답을 추론하지 않는다. 원문에 정답이 없으면 빈 배열 + status "missing".
//   - 허용 표기(①~⑤, 1~5, 콤마/공백 분리, '번')에 한정해 숫자로 변환한다.
//   - "③ 또는 ④", "정답 추정: 3" 류는 억지로 파싱하지 않고 status "unparseable"로 남긴다
//     (REVIEW_REQUIRED 처리 대상).

const CIRCLE_TO_DIGIT: Record<string, string> = {
  "①": "1",
  "②": "2",
  "③": "3",
  "④": "4",
  "⑤": "5",
};

/** "정답:"/"답:"/"answer:" 같은 라벨 prefix (은/는 포함) */
const ANSWER_LABEL_RE = /^(?:정답|답|answer)\s*(?:은|는)?\s*[:：=]?\s*/i;

/** 애매한 표현 키워드. 발견되면 파싱하지 않는다 */
const AMBIGUOUS_KEYWORDS = [
  "추정",
  "모름",
  "없음",
  "참고",
  "또는",
  "~",
  "～",
  "이상",
  "이하",
] as const;

export type AnswerParseResult = {
  /** 파싱된 정답 보기 번호 (원문에 명시된 것만) */
  answers: number[];
  status: "parsed" | "missing" | "unparseable";
  reason: string | null;
};

/**
 * 원문 정답 문자열을 숫자 배열로 정규화한다.
 * 결정론적 rule만 사용. 애매하면 파싱하지 않고 status로 알린다.
 */
export function parseAnswerText(raw: string | null): AnswerParseResult {
  if (raw === null) {
    return { answers: [], status: "missing", reason: "answer_missing" };
  }

  let s = raw.replace(/\s+/g, " ").trim();
  if (s.length === 0) {
    return { answers: [], status: "missing", reason: "answer_missing" };
  }

  const lower = s.toLowerCase();
  for (const keyword of AMBIGUOUS_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { answers: [], status: "unparseable", reason: "answer_ambiguous" };
    }
  }

  // ①~⑤ → 1~5
  s = s.replace(/[①-⑤]/g, (ch) => CIRCLE_TO_DIGIT[ch]);
  s = s.replace(ANSWER_LABEL_RE, "");
  s = s.replace(/(\d)\s*번/g, "$1"); // "3번" → "3"
  s = s.trim();

  if (s.length === 0) {
    return { answers: [], status: "unparseable", reason: "answer_ambiguous" };
  }

  // 남은 문자열이 정확히 "단일 자릿수(1~5) 리스트"인지 확인한다.
  // 12, 3/4 류는 명확한 규칙으로 해석되지 않으므로 파싱하지 않는다.
  const tokens = s.split(/[,、，\s]+/).filter((token) => token.length > 0);
  const numbers: number[] = [];
  for (const token of tokens) {
    if (!/^[1-5]$/.test(token)) {
      return { answers: [], status: "unparseable", reason: "answer_ambiguous" };
    }
    numbers.push(Number.parseInt(token, 10));
  }

  if (numbers.length === 0) {
    return { answers: [], status: "unparseable", reason: "answer_ambiguous" };
  }

  return {
    answers: [...new Set(numbers)], // 중복 제거, 순서 보존
    status: "parsed",
    reason: null,
  };
}
