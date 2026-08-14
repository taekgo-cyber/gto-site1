// CBT 파이프라인 공용 타입 (Session 10-1 최종 PLAN §5/§6 기준).
// 후속 STEP(collector/extractor/llm/validator/qa/dedupe/cli)에서 그대로 재사용한다.

/** 허용 카테고리 코드. 이 4개 외에는 사용하지 않는다. */
export type CbtCategoryCode =
  | "CAT-LAW"
  | "CAT-HANDLING"
  | "CAT-SAFETY"
  | "CAT-SERVICE";

/** CbtCategoryCode → DB subject(과목명) 고정 매핑 (PLAN §4) */
export const CATEGORY_SUBJECT_MAP: Record<CbtCategoryCode, string> = {
  "CAT-LAW": "교통법규",
  "CAT-HANDLING": "화물취급",
  "CAT-SAFETY": "안전운행",
  "CAT-SERVICE": "운송서비스",
};

export const CBT_CATEGORY_CODES: readonly CbtCategoryCode[] = [
  "CAT-LAW",
  "CAT-HANDLING",
  "CAT-SAFETY",
  "CAT-SERVICE",
];

/** 원자료로 되돌아갈 수 있는 Source Traceability (Master 스키마와 분리된 별도 메타데이터) */
export type SourceRef = {
  sourceName: string;
  sourceQuestionId: string;
  /** 원본 페이지 URL (STEP 3에서 받은 값 그대로, 재구성/추측 금지) */
  originalUrl: string | null;
  /** 수집 시각 (STEP 3에서 받은 값 그대로, 재생성 금지) */
  fetchedAt: string | Date | null;
  rawSourceFile: string;
  rawBlockId: string;
  contentHash: string;
};

/** 문제 Block 내부에 포함된 이미지 정보 */
export type ExtractedImage = {
  originalUrl: string;
  altText: string | null;
  /** 다운로드 성공 시 로컬 raw asset 경로, 실패 시 null */
  localPath: string | null;
};

/** DOM Extractor 출력 — LLM 파싱 입력 단위 */
export type RawBlock = {
  blockId: string;
  questionNumberLabel: string | null;
  questionTextRaw: string;
  /** 번호를 포함한 보기 원문 라인 */
  optionsRaw: string[];
  /** 원문에 표기된 정답 영역 (없으면 null) */
  answerRaw: string | null;
  explanationRaw: string | null;
  /** "12번 문제 해설을 참고" 류의 참조 문구 */
  referenceRaw: string | null;
  images: ExtractedImage[];
  source: SourceRef;
};

// ---------------------------------------------------------------------------
// STEP 4 Extractor 출력 타입
// 원문 추출 전용. 검증/정규화(정답 숫자 변환, 분류 등)는 STEP 5 책임이다.
// ---------------------------------------------------------------------------

export type ExtractionStatus = "extracted" | "partial" | "failed";

/** 추출된 보기 1개. index는 보기 번호(1부터 시작), text는 번호 prefix를 제거한 원문 */
export type ExtractedChoice = {
  index: number;
  text: string;
};

/** 이미지가 속한 문제 영역 */
export type ImageLocation =
  | "question"
  | "choice_1"
  | "choice_2"
  | "choice_3"
  | "choice_4"
  | "explanation"
  | "unknown";

export type ExtractedImageAsset = {
  src: string;
  alt: string | null;
  /** 문제 내 이미지 순서 (0부터 시작) */
  index: number;
  location: ImageLocation;
  /** base URL이 제공된 경우 그 값 */
  sourceUrl: string | null;
  /** HTML에 있던 원본 src(상대경로 포함) */
  originalSrc: string;
  /** base URL로 resolve한 절대 URL. 불가능하면 null */
  resolvedSrc: string | null;
  width: number | null;
  height: number | null;
};

export type ExtractedQuestion = {
  sourceName: string;
  sourceQuestionId: string;
  /** STEP 3 provenance를 그대로 pass-through한 원본 추적 정보 */
  sourceRef: SourceRef;
  /** 문제 영역 container의 innerHTML. container 미확정(body fallback) 시에도
   *  No Drop 원칙에 따라 원본 HTML을 보존한다. 비어 있으면 null */
  rawHtmlSnippet: string | null;
  /** 문제 번호. HTML에 없으면 null (sourceQuestionId는 보조 식별자) */
  questionNumber: number | null;
  questionText: string;
  choices: ExtractedChoice[];
  /** HTML에 표기된 정답 원문 그대로 (숫자 변환 금지). 없으면 null */
  rawAnswerText: string | null;
  explanation: string | null;
  images: ExtractedImageAsset[];
  extractionStatus: ExtractionStatus;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// STEP 5 Normalizer 출력 타입
// ExtractedQuestion → NormalizedQuestion 변환. 검증/정규화/분류/fingerprint 담당.
// ---------------------------------------------------------------------------

/** STEP 5 분류 카테고리. 4개 고정 코드 + UNKNOWN(미분류). 새 카테고리 생성 금지 */
export type NormalizedCategoryCode = CbtCategoryCode | "UNKNOWN";

export const NORMALIZED_CATEGORY_CODES: readonly NormalizedCategoryCode[] = [
  ...CBT_CATEGORY_CODES,
  "UNKNOWN",
];

/** STEP 5 검증 상태. 데이터를 삭제하지 않고 보존한 채 상태만 기록한다 */
export type ValidationStatus = "VALID" | "REVIEW_REQUIRED" | "REJECTED";

/** category 결정 경로 추적 (LLM 사용 시 "llm") */
export type ClassificationMethod = "source" | "rule" | "llm" | "unknown";

/** LLM이 사용된 용도 */
export type LlmUsageKind = "normalization" | "classification";

/** 해설의 다른 문제 참조 metadata. 실제 FK 연결은 하지 않는다 */
export type ExplanationReference = {
  rawReferenceText: string;
  referencedQuestionNumber: number | null;
};

/** STEP 5 이후 소스 추적 정보 = SourceRef + snippet id */
export type NormalizedSourceRef = SourceRef & {
  /** raw HTML snippet 저장 후 STEP 6에서 채운다. 이 단계는 null */
  rawHtmlSnippetId: string | null;
};

export type NormalizedQuestion = {
  /** 원자료 추적 정보 (STEP 4의 ExtractedQuestion 그대로 pass-through) */
  sourceRef: NormalizedSourceRef;
  category: NormalizedCategoryCode;
  classificationMethod: ClassificationMethod;
  questionNumber: number | null;
  questionText: string;
  choices: ExtractedChoice[];
  /** 정답 보기 번호 (1부터). 원문에 명확한 정답이 없으면 빈 배열 (추론 금지) */
  normalizedAnswers: number[];
  explanation: string | null;
  explanationReference: ExplanationReference | null;
  images: ExtractedImageAsset[];
  validationStatus: ValidationStatus;
  validationErrors: string[];
  contentFingerprint: string;
  llmMetadata?: {
    usedFor: LlmUsageKind[];
    confidenceScore?: number;
  };
};

/** 허용 정답 값. 원문에 정답이 명확하지 않으면 null (추론 금지) */
export type CbtAnswer = 1 | 2 | 3 | 4;

export type ParsedOption = {
  id: number;
  text: string;
};

/** LLM 파싱 출력 — validator/QA 검증 대상 */
export type ParsedQuestion = {
  category: CbtCategoryCode;
  subject: string;
  questionText: string;
  options: ParsedOption[];
  answer: CbtAnswer | null;
  explanation: string | null;
  /** 다른 문제 해설을 참조하는 문구. 내용을 복사하지 않고 참조만 기록 */
  explanationReference: string | null;
  imageRequired: boolean;
};

/** Candidate 상태 — DB의 QuestionStatus(DRAFT/PUBLISHED/HIDDEN)와는 별개 개념 */
export type CandidateStatus = "PARSED" | "REVIEW" | "REJECTED";

export type QaFlag =
  | "answer_missing"
  | "answer_ambiguous"
  | "option_number_issue"
  | "explanation_reference"
  | "source_text_issue"
  | "extraction_issue"
  | "image_required"
  | "image_extraction_issue"
  | "metadata_issue"
  | "duplicate_suspect"
  | "category_unclassified"
  | "law_revision_suspect";

export type QaInfo = {
  status: CandidateStatus;
  flags: QaFlag[];
  notes: string[];
};

export type LlmMeta = {
  provider: string;
  model: string;
  promptVersion: string;
  cacheKey: string;
};

/** Candidate Dataset 최종 레코드 (ndjson 1줄) */
export type CandidateRecord = {
  /** canonical identity: sha256(category + normalized question + normalized options) */
  questionKey: string;
  parsed: ParsedQuestion;
  images: ExtractedImage[];
  source: SourceRef;
  qa: QaInfo;
  llm: LlmMeta;
  duplicateOf: string | null;
  createdAt: string;
};
