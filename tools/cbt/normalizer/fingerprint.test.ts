import { describe, expect, it } from "vitest";
import { createContentFingerprint } from "./fingerprint";
import type { ExtractedChoice } from "../types";

function choices(texts: string[]): ExtractedChoice[] {
  return texts.map((text, i) => ({ index: i + 1, text }));
}

const Q = "화물자동차의 최대적재량을 초과한 경우에 대한 설명으로 올바른 것은?";
const C = choices([
  "운전면허가 즉시 취소된다",
  "과태료·벌점 등 행정처분을 받을 수 있다",
  "아무런 제재가 없다",
  "사업용 화물차는 예외로 처벌하지 않는다",
]);

describe("createContentFingerprint", () => {
  it("31. 동일 question + 동일 choices → 동일 fingerprint", () => {
    const a = createContentFingerprint(Q, C);
    const b = createContentFingerprint(Q, C);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("32. question 변경 → 다른 fingerprint", () => {
    const a = createContentFingerprint(Q, C);
    const b = createContentFingerprint(`${Q} (수정)`, C);
    expect(a).not.toBe(b);
  });

  it("33. choice 변경 → 다른 fingerprint", () => {
    const modified = choices([
      C[0].text,
      "과태료·벌점 등 행정처분",
      C[2].text,
      C[3].text,
    ]);
    expect(createContentFingerprint(Q, C)).not.toBe(
      createContentFingerprint(Q, modified),
    );
  });

  it("34. choice 순서 변경 → 다른 fingerprint (순서 유지)", () => {
    const reordered = choices([C[1].text, C[0].text, C[2].text, C[3].text]);
    expect(createContentFingerprint(Q, C)).not.toBe(
      createContentFingerprint(Q, reordered),
    );
  });

  it("공백만 다른 questionText는 동일 fingerprint를 만든다", () => {
    const a = createContentFingerprint(Q, C);
    const b = createContentFingerprint(`  ${Q}   `, C);
    expect(a).toBe(b);
  });

  it("questionText 단독이 아니라 choices가 포함된다", () => {
    const fingerprintOnlyQuestion = createContentFingerprint(Q, []);
    expect(createContentFingerprint(Q, C)).not.toBe(fingerprintOnlyQuestion);
  });
});
