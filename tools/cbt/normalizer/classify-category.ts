// STEP 5 — 카테고리 분류 (Session 10-1 STEP 5 §13).
// 우선순위: 소스 설정의 확정 category → deterministic rule → (LLM) → UNKNOWN.
// 새 카테고리 생성 금지: 허용 값은 4개 코드 + UNKNOWN뿐이다.

import { CBT_SOURCES } from "../sources.config";
import type { CbtCategoryCode, NormalizedCategoryCode } from "../types";

export type CategoryResult = {
  category: NormalizedCategoryCode;
  method: "source" | "rule" | "unknown";
};

/** 소스 설정에서 기본 카테고리 조회. 소스가 없으면 null */
export function resolveSourceCategory(
  sourceName: string,
): CbtCategoryCode | "UNKNOWN" | null {
  const source = CBT_SOURCES.find((s) => s.sourceName === sourceName);
  return source ? source.category : null;
}

/**
 * deterministic keyword 기반 rule classification.
 * EXTRA처럼 소스 category가 UNKNOWN인 문제군을 4개 카테고리로 분류한다.
 * 동점이거나 키워드가 하나도 없으면 null (불확실 → UNKNOWN 유지).
 */
const CATEGORY_KEYWORDS: Record<CbtCategoryCode, readonly string[]> = {
  "CAT-LAW": [
    "법",
    "규정",
    "벌칙",
    "과태료",
    "처분",
    "도로교통",
    "시행령",
    "시행규칙",
    "결격",
    "등록",
    "자격",
    "법규",
  ],
  "CAT-HANDLING": [
    "적재",
    "하역",
    "운반",
    "포장",
    "중량",
    "화물",
    "지게차",
    "크레인",
    "견인",
    "감속기",
    "화주",
  ],
  "CAT-SAFETY": [
    "안전",
    "운전",
    "사고",
    "주행",
    "휴게",
    "피로",
    "제동",
    "타이어",
    "과속",
    "신호",
    "보행자",
    "낙하",
  ],
  "CAT-SERVICE": [
    "서비스",
    "고객",
    "운송",
    "요금",
    "계약",
    "편의",
    "접객",
    "민원",
    "부가",
    "배상",
  ],
};

export function classifyByKeyword(text: string): CbtCategoryCode | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const scores = new Map<CbtCategoryCode, number>();
  let best: CbtCategoryCode | null = null;
  let bestScore = 0;

  for (const code of Object.keys(CATEGORY_KEYWORDS) as CbtCategoryCode[]) {
    let score = 0;
    for (const keyword of CATEGORY_KEYWORDS[code]) {
      if (trimmed.includes(keyword)) score += 1;
    }
    scores.set(code, score);
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }

  if (bestScore === 0) return null;
  const tied = [...scores.values()].filter((s) => s === bestScore).length;
  if (tied > 1) return null; // 동점이면 불확실 → 분류 보류
  return best;
}

export type ClassifyCategoryInput = {
  /** 소스 설정의 기본 카테고리 (null이면 소스 미확인) */
  sourceCategory: CbtCategoryCode | "UNKNOWN" | null;
  /** rule classification에 사용할 텍스트 (questionText + 보기) */
  text: string;
};

export function classifyCategory(input: ClassifyCategoryInput): CategoryResult {
  if (input.sourceCategory !== null && input.sourceCategory !== "UNKNOWN") {
    return { category: input.sourceCategory, method: "source" };
  }

  const byKeyword = classifyByKeyword(input.text);
  if (byKeyword !== null) {
    return { category: byKeyword, method: "rule" };
  }

  return { category: "UNKNOWN", method: "unknown" };
}
