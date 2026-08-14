// STEP 8 — Similarity Checker (STEP 8 §13).
// 가벼운 token 기반 Jaccard similarity + threshold flag.
// 유사도 점수는 "저작권 안전"을 자동 판정하지 않는다. Human Review 참고용 위험 플래그일 뿐이다.
// 자동 Master 승격의 법적 판정 기준으로 사용하지 않는다.

/** 기본 유사도 경고 threshold. 참고용이며 법적 기준이 아니다 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

/**
 * 텍스트 토큰화: 소문자화 후 공백/문장부호/비문자 경계로 분리.
 * 한국어+영문 혼합 텍스트 대응. 빈 토큰 제거.
 */
export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((token) => token.length > 0);
}

/** token 집합 기준 Jaccard similarity (0..1). 두 텍스트가 비면 0 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenizeText(a);
  const tokensB = tokenizeText(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

export type SimilarityResult = {
  score: number;
  warning: boolean;
  threshold: number;
};

/**
 * 생성 문제(질문+보기+해설)와 원문(질문+보기+해설)의 유사도를 계산한다.
 * threshold 이상이면 warning=true. 이 값은 참고용 플래그이며 자동 판정에 사용하지 않는다.
 */
export function computeSimilarity(
  generatedText: string,
  sourceText: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): SimilarityResult {
  const score = jaccardSimilarity(generatedText, sourceText);
  return { score, warning: score >= threshold, threshold };
}
