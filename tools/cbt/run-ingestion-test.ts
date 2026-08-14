// STEP 7 — Single Source Pipeline Penetration 실행 스크립트.
// 실제 공개 Source(newbt.kr /문제/92628) 1건을
// STEP 3 Collector → STEP 4 newbt Extractor → STEP 5 Normalizer → STEP 6 Candidate Persistence
// 전 구간으로 관통시켜 사람이 확인할 수 있는 결과를 출력한다.
//
// 조건 (STEP 7 범위):
//   - URL 1개, 실행 1회, loop/scheduler/concurrency/자동 재수집 없음
//   - 정답 API / LLM 호출 없음 (answerLocation: "separate" → answer_missing → REVIEW_REQUIRED)
//   - 기본(권장)은 저장된 full-page fixture를 사용해 결정적으로 실행한다.
//   - `--live`를 붙이면 기존 Collector(fetch-source.ts)로 실시간 1회 fetch 후 raw 저장소에 보존한다.
//   - 실행 후 Candidate가 실제 DB에 upsert된다(동일 데이터 재실행은 idempotent).
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CBT_RAW_DIR } from "./config";
import {
  buildQuestionUrl,
  collectSourceId,
} from "./collector/fetch-source";
import { CBT_SOURCES } from "./sources.config";
import { extractNewbtQuestion } from "./extractor/dom-extract-newbt";
import { normalizeQuestion } from "./normalizer/normalize-question";
import { persistCandidateQuestion } from "./persist/persist-candidate";
import type { SourceRef } from "./types";

const SOURCE_NAME = "NEWBT-HWMUL";
const SOURCE_ID = process.env.CBT_TEST_SOURCE_ID ?? "92628";
const LIVE = process.argv.includes("--live");

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function questionTextOf(q: { questionText: string }): string {
  return q.questionText.length <= 60
    ? q.questionText
    : `${q.questionText.slice(0, 57)}...`;
}

async function main() {
  const source = CBT_SOURCES.find((s) => s.sourceName === SOURCE_NAME);
  if (!source) throw new Error(`source 설정 없음: ${SOURCE_NAME}`);
  const url = buildQuestionUrl(source, SOURCE_ID);
  if (url === null) throw new Error(`urlTemplate 미확정: ${SOURCE_NAME}`);

  // ----------------------------------------------------------------
  // STEP 3 — Collector (실제 fetch 또는 fixture 단일 건)
  // ----------------------------------------------------------------
  let html: Buffer;
  let sourceRef: SourceRef;
  if (LIVE) {
    console.log(`--live: 실시간 fetch 1건 (${url})`);
    const result = await collectSourceId(source, SOURCE_ID, {
      force: true,
      requestIntervalMs: 0,
    });
    if (result.kind !== "collected") {
      throw new Error(`수집 실패: ${JSON.stringify(result)}`);
    }
    sourceRef = result.source;
    html = readFileSync(
      `${CBT_RAW_DIR}/${source.sourceName}/${SOURCE_ID}.html`,
    );
  } else {
    html = readFileSync(
      new URL("./extractor/__fixtures__/newbt-question.html", import.meta.url),
    );
    sourceRef = {
      sourceName: SOURCE_NAME,
      sourceQuestionId: SOURCE_ID,
      originalUrl: url,
      fetchedAt: new Date().toISOString(),
      rawSourceFile: `${source.sourceName}/${SOURCE_ID}.html`,
      rawBlockId: "",
      contentHash: sha256Hex(html),
    };
  }

  console.log(`[STEP 7 single source run] source=${SOURCE_NAME} id=${SOURCE_ID}`);
  console.log(`  URL: ${url}`);
  console.log("  STEP 3 Collector  :", JSON.stringify({
    rawSourceFile: sourceRef.rawSourceFile,
    contentHash: sourceRef.contentHash.slice(0, 12),
    fetchedAt: sourceRef.fetchedAt,
    bytes: html.length,
  }));

  // ----------------------------------------------------------------
  // STEP 4 — newbt Source-specific Extractor
  // ----------------------------------------------------------------
  const extracted = extractNewbtQuestion({
    html,
    sourceName: SOURCE_NAME,
    sourceQuestionId: SOURCE_ID,
    baseUrl: new URL(url).origin,
    sourceRef,
  });
  console.log("  STEP 4 Extractor  :", JSON.stringify({
    extracted: extracted.extractionStatus === "failed" ? 0 : 1,
    extractionStatus: extracted.extractionStatus,
    questionNumber: extracted.questionNumber,
    questionText: questionTextOf(extracted),
    choices: extracted.choices.length,
    images: extracted.images.length,
    warnings: extracted.warnings,
  }));

  // ----------------------------------------------------------------
  // STEP 5 — Normalizer
  // ----------------------------------------------------------------
  const normalized = normalizeQuestion(extracted);
  console.log("  STEP 5 Normalizer :", JSON.stringify({
    normalized: 1,
    category: normalized.category,
    validationStatus: normalized.validationStatus,
    validationErrors: normalized.validationErrors,
    normalizedAnswers: normalized.normalizedAnswers,
    contentFingerprint: normalized.contentFingerprint.slice(0, 16),
  }));

  // ----------------------------------------------------------------
  // STEP 6 — Candidate Persistence (실제 DB + snippet 저장소)
  // ----------------------------------------------------------------
  const persisted = await persistCandidateQuestion({
    question: normalized,
    rawHtmlSnippet: extracted.rawHtmlSnippet,
  });
  console.log("  STEP 6 Persistence:", JSON.stringify({
    candidateId: persisted.candidateId,
    created: persisted.created,
    contentChanged: persisted.contentChanged,
    reviewPending: persisted.reviewPending,
    isDuplicate: persisted.isDuplicate,
    rawHtmlSnippetId: persisted.rawHtmlSnippetId,
    snippetStored: persisted.rawHtmlSnippetId !== null,
  }));

  console.log(
    `\n완료: source=${SOURCE_NAME} url=${url} → candidate=${persisted.candidateId} ` +
      `status=${normalized.validationStatus} qnum=${extracted.questionNumber} ` +
      `fingerprint=${normalized.contentFingerprint.slice(0, 16)} ` +
      `snippet=${persisted.rawHtmlSnippetId !== null ? "저장됨" : "없음"}`,
  );
}

main().catch((err) => {
  console.error("STEP 7 single source run 실패:", err);
  process.exitCode = 1;
});