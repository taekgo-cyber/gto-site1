// 텍스트 정규화 (Session 10-1 STEP 4 §9).
// 원칙: Raw HTML 전체를 sanitize하지 않는다.
// Cheerio DOM 파싱 → 요소 선택 → 텍스트 추출 후 개별 텍스트 값에만 적용한다.
// 원문 의미를 훼손하지 않는다: 보기 번호/개행/단어 내 공백은 보존한다.

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (match) => {
    return ENTITY_MAP[match.toLowerCase()] ?? match;
  });
}

/**
 * DOM 탐색 후 얻은 개별 텍스트에 적용하는 정규화.
 * - HTML entity decode
 * - <br> 계열 → 줄바꿈
 * - &nbsp;(U+00A0) → 일반 공백
 * - zero-width character 제거
 * - \r 정리
 * - 라인별 앞뒤 공백/연속 공백 정리, 빈 라인 제거
 * 단, 문장 내 단일 공백과 보기 간 개행(의미 구분)은 보존한다.
 */
export function sanitizeText(input: string): string {
  if (!input) return "";

  let text = input;
  text = decodeHtmlEntities(text);
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[\u200b-\u200d\u200e\u200f\u2060\ufeff]/g, "");
  text = text.replace(/\r\n?/g, "\n");

  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line) => line.length > 0);

  return lines.join("\n");
}
