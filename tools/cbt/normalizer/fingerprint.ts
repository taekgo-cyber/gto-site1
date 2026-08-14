// STEP 5 — content fingerprint (Session 10-1 STEP 5 §17).
// questionText + choices(순서 유지)를 안정적으로 결합한 SHA-256.
// - questionText 단독 fingerprint는 사용하지 않는다.
// - 공백 normalization 결과를 일관되게 사용한다 (sanitizeText 재사용).
// - 동일 fingerprint가 여러 건이어도 삭제/병합하지 않는다 (STEP 6 dedupe 책임).

import { createHash } from "node:crypto";
import type { ExtractedChoice } from "../types";
import { sanitizeText } from "../extractor/sanitize";

/** fingerprint 입력용 안정 정규화 (entity/공백 일관화) */
export function normalizeFingerprintPart(text: string): string {
  return sanitizeText(text);
}

/**
 * content fingerprint 생성.
 * questionText와 choices를 순서대로 결합해 SHA-256 hex를 만든다.
 * 결합 시 충돌 방지 delimiter(\u0000/\u0001)를 사용한다.
 */
export function createContentFingerprint(
  questionText: string,
  choices: readonly ExtractedChoice[],
): string {
  const parts = [
    normalizeFingerprintPart(questionText),
    ...choices.map(
      (choice) => `${choice.index}\u0000${normalizeFingerprintPart(choice.text)}`,
    ),
  ];
  const joined = parts.join("\u0001");
  return createHash("sha256").update(joined).digest("hex");
}
