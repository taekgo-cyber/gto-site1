// CBT 수집 대상 Source 정의 (Session 10-1 PLAN §7/§13).
// 실제 수집 대상 사이트가 아직 확정되지 않았으므로, urlTemplate은 전부 null로 두고
// status: "planned"로 유지한다. 대상 사이트가 확정되면 urlTemplate을 설정하고
// status를 "configured"로 바꾼다. (실제 URL을 추측해 채우지 않는다)
import type { CbtCategoryCode } from "./types";

/** urlTemplate 내에서 문제 번호가 대체되는 플레이스홀더 */
export const URL_PLACEHOLDER = "{id}";

/** 원문에 정답이 표기된 위치. 실제 소스 확인 전에는 "unknown" */
export type SourceAnswerLocation = "unknown" | "inline" | "separate";

export type SourceIdRange = {
  from: number;
  to: number;
};

/** planned: urlTemplate 미확정(수집 불가) / configured: urlTemplate 확정(수집 가능) */
export type SourceStatus = "planned" | "configured";

export type CbtSourceDef = {
  sourceName: string;
  /** 기본 배정 카테고리. 649~790 추가군처럼 아직 미분류면 "UNKNOWN" (4개 코드 외 미사용) */
  category: CbtCategoryCode | "UNKNOWN";
  /** 문제 페이지 URL 템플릿. {id} 자리에 sourceQuestionId가 치환된다. 확정 전 null */
  urlTemplate: string | null;
  idRanges: SourceIdRange[];
  answerLocation: SourceAnswerLocation;
  status: SourceStatus;
  note?: string;
};

export const SOURCE_PLACEHOLDER_NOTE =
  "실제 수집 대상 사이트 확정 전 (urlTemplate 미지정, 수집 불가 상태)";

/**
 * 확정된 수집 대상 소스 목록.
 * LAW 001~220 / HANDLING 001~118 / SAFETY 001~200 / SERVICE 001~110,
 * 추가 공개 문제군 649~790 (별도 카테고리 없이 파싱 후 4개 중 분류 또는 REVIEW).
 * 실제 URL은 아직 확정되지 않았다.
 */
export const CBT_SOURCES: readonly CbtSourceDef[] = [
  {
    sourceName: "LAW",
    category: "CAT-LAW",
    urlTemplate: null,
    idRanges: [{ from: 1, to: 220 }],
    answerLocation: "unknown",
    status: "planned",
    note: SOURCE_PLACEHOLDER_NOTE,
  },
  {
    sourceName: "HANDLING",
    category: "CAT-HANDLING",
    urlTemplate: null,
    idRanges: [{ from: 1, to: 118 }],
    answerLocation: "unknown",
    status: "planned",
    note: SOURCE_PLACEHOLDER_NOTE,
  },
  {
    sourceName: "SAFETY",
    category: "CAT-SAFETY",
    urlTemplate: null,
    idRanges: [{ from: 1, to: 200 }],
    answerLocation: "unknown",
    status: "planned",
    note: SOURCE_PLACEHOLDER_NOTE,
  },
  {
    sourceName: "SERVICE",
    category: "CAT-SERVICE",
    urlTemplate: null,
    idRanges: [{ from: 1, to: 110 }],
    answerLocation: "unknown",
    status: "planned",
    note: SOURCE_PLACEHOLDER_NOTE,
  },
  {
    sourceName: "EXTRA",
    category: "UNKNOWN",
    urlTemplate: null,
    idRanges: [{ from: 649, to: 790 }],
    answerLocation: "unknown",
    status: "planned",
    note: "추가 공개 문제군. 별도 카테고리를 만들지 않는다. 파싱 후 4개 Category 중 하나로 분류하거나 REVIEW 처리한다.",
  },
  {
    sourceName: "NEWBT-HWMUL",
    category: "UNKNOWN",
    urlTemplate: "https://newbt.kr/문제/{id}",
    idRanges: [],
    answerLocation: "separate",
    status: "configured",
    note: "newbt.kr 화물운송종사 문제 상세 페이지(공개 GET). qid는 sparse numeric(9xxxx)이라 idRanges 대신 serialAllList/keywordSearch 공개 API 응답의 id로 열거한다. 정답은 페이지 HTML에 없고 별도 GET /question/isAnswer/{id} 응답으로만 제공된다(answerLocation: separate). [제2회 실전모의고사] serial id=1968 / exam id=241.",
  },
];

/** "LAW", 1 → "LAW-001" */
export function formatSourceQuestionId(
  sourceName: string,
  number: number,
): string {
  return `${sourceName}-${String(number).padStart(3, "0")}`;
}

/** 소스의 모든 idRanges를 sourceQuestionId 목록으로 확장한다 */
export function buildIdList(source: CbtSourceDef): string[] {
  const ids: string[] = [];
  for (const range of source.idRanges) {
    for (let n = range.from; n <= range.to; n += 1) {
      ids.push(formatSourceQuestionId(source.sourceName, n));
    }
  }
  return ids;
}

/** urlTemplate이 확정되지 않은 소스인지 여부 */
export function isSourceCollectable(source: CbtSourceDef): boolean {
  return source.status === "configured" && source.urlTemplate !== null;
}
