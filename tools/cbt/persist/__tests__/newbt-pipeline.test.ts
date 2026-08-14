// STEP 7 — newbt.kr 단일 소스 파이프라인 관통 테스트.
// RAW HTML fixture → (STEP 3 Collector) → (STEP 4 newbt Extractor) → (STEP 5 Normalizer)
// → (STEP 6 Candidate Persistence)를 fake DB + memory storage로 검증한다.
// Collector는 실제 fetch 대신 fixture를 반환하도록 mock하며, URL/원본 경로/contentHash 등
// provenance는 sources.config의 urlTemplate을 통해 생성한다 (URL 하드코딩 없음).
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedQuestion, SourceRef } from "../../types";
import { collectSourceId } from "../../collector/fetch-source";
import { CBT_SOURCES } from "../../sources.config";
import { extractNewbtQuestion } from "../../extractor/dom-extract-newbt";
import { normalizeQuestion } from "../../normalizer/normalize-question";
import { persistCandidateQuestion } from "../persist-candidate";
import { computeSnippetId, type SnippetStorage } from "../snippet-storage";
import { createFakePersistDb, type FakePersistDb } from "./fakePrisma";

const NEWBT_SOURCE = CBT_SOURCES.find((s) => s.sourceName === "NEWBT-HWMUL")!;

function fixture(name: string): Buffer {
  return readFileSync(new URL(`../../extractor/__fixtures__/${name}`, import.meta.url));
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function makeMemoryStorage() {
  const files = new Map<string, string>();
  const storage: SnippetStorage = {
    async save(content) {
      const id = computeSnippetId(content);
      if (!files.has(id)) files.set(id, content);
      return { id, content };
    },
    async read(id) {
      return files.get(id) ?? null;
    },
    async exists(id) {
      return files.has(id);
    },
  };
  return { storage, files };
}

/**
 * STEP 3 Collector를 통해 RAW fixture를 수집한 결과(SourceRef)를 만든다.
 * 실제 네트워크 대신 global fetch를 fixture 반환으로 mock한다 (1회 fetch).
 */
async function collectFixture(
  html: Buffer,
  sourceQuestionId: string,
  rawDir: string,
): Promise<SourceRef> {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(html.toString("utf8"), { status: 200 }),
  );
  const result = await collectSourceId(NEWBT_SOURCE, sourceQuestionId, {
    rawDir,
    force: true,
    requestIntervalMs: 0,
    maxRetries: 1,
    timeoutMs: 5000,
    retryBaseDelayMs: 1,
  });
  if (result.kind !== "collected") {
    throw new Error(`collectFixture 실패: ${JSON.stringify(result)}`);
  }
  expect(result.source.originalUrl).toBe(
    `https://newbt.kr/문제/${sourceQuestionId}`,
  );
  expect(result.source.contentHash).toBe(sha256Hex(html));
  return result.source;
}

/** STEP 3 수집 결과(sourceRef)를 받아 STEP 4→5를 수행한다 */
function extractAndNormalize(html: Buffer, sourceRef: SourceRef) {
  const extracted = extractNewbtQuestion({
    html,
    sourceName: sourceRef.sourceName,
    sourceQuestionId: sourceRef.sourceQuestionId,
    baseUrl: new URL(sourceRef.originalUrl!).origin,
    sourceRef,
  });
  return {
    rawHtmlSnippet: extracted.rawHtmlSnippet,
    normalized: normalizeQuestion(extracted),
    sourceRef,
  };
}

async function persist(
  fake: FakePersistDb,
  storage: SnippetStorage,
  input: {
    normalized: NormalizedQuestion;
    rawHtmlSnippet: string | null;
  },
) {
  return persistCandidateQuestion(
    {
      question: input.normalized,
      rawHtmlSnippet: input.rawHtmlSnippet,
    },
    { db: fake.db, storage },
  );
}

function membersOf(fake: FakePersistDb, groupId: string): string[] {
  return fake.store.duplicateMembers
    .filter((m) => m.groupId === groupId)
    .map((m) => m.candidateQuestionId);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("newbt.kr STEP 3→6 파이프라인 관통", () => {
  const originalHtml = fixture("newbt-question.html");
  const modifiedHtml = Buffer.from(
    originalHtml
      .toString("utf8")
      .replaceAll("합리화 특장차", "합리화 특장차(변형)"),
    "utf8",
  );

  it("RAW fixture → Collector → Extractor → Normalizer → Candidate (provenance 보존)", async () => {
    const rawDir = await fs.mkdtemp(path.join(os.tmpdir(), "cbt-newbt-raw-"));
    try {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const sourceRef = await collectFixture(originalHtml, "92628", rawDir);
      const input = extractAndNormalize(originalHtml, sourceRef);
      const normalized = input.normalized;

      // STEP 5 결과: 문항번호는 qid가 아니라 실제 HTML의 번호(38)
      expect(normalized.questionNumber).toBe(38);
      expect(normalized.questionText).toContain("합리화 특장차");
      expect(normalized.choices).toEqual([
        { index: 1, text: "분립체 수송차" },
        { index: 2, text: "실내하역기기 장비차" },
        { index: 3, text: "액체 수송차" },
        { index: 4, text: "카고 트럭" },
      ]);
      expect(normalized.category).toBe("CAT-HANDLING");
      // 정답은 별도 source → 추론/호출 없이 answer_missing → REVIEW_REQUIRED
      expect(normalized.normalizedAnswers).toEqual([]);
      expect(normalized.validationStatus).toBe("REVIEW_REQUIRED");
      expect(normalized.validationErrors).toContain("answer_missing");

      const result = await persist(fake, storage, input);

      expect(result.created).toBe(true);
      expect(result.reviewPending).toBe(true);
      expect(result.rawHtmlSnippetId).toBeTruthy();

      const row = fake.store.candidateQuestions[0];
      expect(row.sourceName).toBe("NEWBT-HWMUL");
      expect(row.sourceQuestionId).toBe("92628");
      expect(row.originalUrl).toBe("https://newbt.kr/문제/92628");
      expect(row.fetchedAt).toBe(sourceRef.fetchedAt);
      expect(row.validationStatus).toBe("REVIEW_REQUIRED");
      expect(row.questionText).toContain("합리화 특장차");
      expect(row.choices).toEqual(normalized.choices);
      expect(row.contentFingerprint).toBe(normalized.contentFingerprint);
      expect(row.rawHtmlSnippetId).toBe(result.rawHtmlSnippetId);

      const review = fake.store.candidateReviews.find(
        (r) => r.candidateQuestionId === row.id,
      );
      expect(review?.reviewStatus).toBe("PENDING");

      // snippet은 content-addressable로 실제 원문이 저장되어 있는지 확인 (No Drop)
      expect(await storage.exists(result.rawHtmlSnippetId!)).toBe(true);
      const snippet = await storage.read(result.rawHtmlSnippetId!);
      expect(snippet).toContain('h5 class="subject"');
      expect(snippet).toContain("합리화 특장차");
      expect(snippet).toContain("분립체 수송차");
    } finally {
      await fs.rm(rawDir, { recursive: true, force: true });
    }
  });

  it("동일 데이터 재수집은 idempotent하다 (신규 생성/중복 membership/review 무변경)", async () => {
    const rawDir = await fs.mkdtemp(path.join(os.tmpdir(), "cbt-newbt-raw-"));
    try {
      const fake = createFakePersistDb();
      const { storage, files } = makeMemoryStorage();
      const sourceRef = await collectFixture(originalHtml, "92628", rawDir);
      const input = extractAndNormalize(originalHtml, sourceRef);

      const first = await persist(fake, storage, input);
      const second = await persist(fake, storage, input);

      expect(second.created).toBe(false);
      expect(second.contentChanged).toBe(false);
      expect(second.candidateId).toBe(first.candidateId);
      expect(second.rawHtmlSnippetId).toBe(first.rawHtmlSnippetId);
      expect(files.size).toBe(1); // 동일 snippet은 중복 저장하지 않는다

      expect(fake.store.candidateQuestions).toHaveLength(1);
      expect(fake.store.candidateReviews).toHaveLength(1);
      expect(fake.store.duplicateGroups).toHaveLength(0);
      expect(fake.store.duplicateMembers).toHaveLength(0);
    } finally {
      await fs.rm(rawDir, { recursive: true, force: true });
    }
  });

  it("변경된 지문(fingerprint AAA→BBB) 재수집 시 stale membership이 정리된다", async () => {
    const rawDir = await fs.mkdtemp(path.join(os.tmpdir(), "cbt-newbt-raw-"));
    try {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      // 동일 지문의 peer 후보(92627)로 중복 그룹 형성
      const sourceRef = await collectFixture(originalHtml, "92628", rawDir);
      const peerRef = await collectFixture(originalHtml, "92627", rawDir);
      const input = extractAndNormalize(originalHtml, sourceRef);
      const peerInput = extractAndNormalize(originalHtml, peerRef);
      expect(peerInput.normalized.contentFingerprint).toBe(
        input.normalized.contentFingerprint,
      );

      const original = await persist(fake, storage, input);
      const peerResult = await persist(fake, storage, peerInput);
      expect(peerResult.isDuplicate).toBe(true);
      expect(peerResult.duplicateGroupId).toBeTruthy();
      const groupId = peerResult.duplicateGroupId!;
      expect(membersOf(fake, groupId).sort()).toEqual(
        [original.candidateId, peerResult.candidateId].sort(),
      );

      // 지문이 바뀐(B) 재수집 → fingerprint 변경 → 이전 그룹에서 membership 제거
      const changedRef = await collectFixture(modifiedHtml, "92628", rawDir);
      const changedInput = extractAndNormalize(modifiedHtml, changedRef);
      expect(changedInput.normalized.contentFingerprint).not.toBe(
        input.normalized.contentFingerprint,
      );

      const result = await persist(fake, storage, changedInput);

      expect(result.contentChanged).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.duplicateGroupId).toBeNull();

      // original 후보는 이전 그룹에서 제거되어 stale membership이 남지 않는다
      expect(membersOf(fake, groupId)).toEqual([peerResult.candidateId]);
      const stale = fake.store.duplicateMembers.filter(
        (m) => m.candidateQuestionId === original.candidateId,
      );
      expect(stale).toHaveLength(0);

      // 내용 변경으로 review는 PENDING으로 재개된다
      const review = fake.store.candidateReviews.find(
        (r) => r.candidateQuestionId === original.candidateId,
      );
      expect(review?.reviewStatus).toBe("PENDING");
    } finally {
      await fs.rm(rawDir, { recursive: true, force: true });
    }
  });

  it("partial 파싱도 REJECTED Candidate로 저장되고 raw HTML snippet이 보존된다 (No Drop)", async () => {
    const rawDir = await fs.mkdtemp(path.join(os.tmpdir(), "cbt-newbt-raw-"));
    try {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      // h5.subject(문제 본문)가 없는 newbt container → partial
      const partialHtml = Buffer.from(
        `<!DOCTYPE html><html lang="ko"><body><div class="blog-post question">
          <p>본문이 파싱되지 않는 문제.</p>
          <ul class="example"><li>가</li><li>나</li><li>다</li><li>라</li></ul>
        </div></body></html>`,
      );
      const sourceRef = await collectFixture(partialHtml, "92628", rawDir);
      const input = extractAndNormalize(partialHtml, sourceRef);

      expect(input.rawHtmlSnippet).toContain("본문이 파싱되지 않는 문제.");
      expect(input.normalized.validationStatus).toBe("REJECTED");
      expect(input.normalized.validationErrors).toContain(
        "question_text_missing",
      );

      const result = await persist(fake, storage, input);

      const row = fake.store.candidateQuestions[0];
      expect(row.validationStatus).toBe("REJECTED");
      expect(row.rawHtmlSnippetId).toBe(result.rawHtmlSnippetId);
      // 원본 HTML은 버리지 않는다
      expect(await storage.read(result.rawHtmlSnippetId!)).toContain(
        "본문이 파싱되지 않는 문제.",
      );
      const review = fake.store.candidateReviews.find(
        (r) => r.candidateQuestionId === row.id,
      );
      expect(review?.reviewStatus).toBe("PENDING");
    } finally {
      await fs.rm(rawDir, { recursive: true, force: true });
    }
  });
});
