import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "../../types";
import { extractQuestionsFromHtml } from "../../extractor/dom-extract";
import { normalizeQuestion } from "../../normalizer/normalize-question";
import { persistCandidateQuestion } from "../persist-candidate";
import { computeSnippetId, type SnippetStorage } from "../snippet-storage";
import { createFakePersistDb, type FakePersistDb } from "./fakePrisma";

let seq = 0;

function makeQuestion(
  overrides: Partial<NormalizedQuestion> = {},
): NormalizedQuestion {
  seq += 1;
  const base: NormalizedQuestion = {
    sourceRef: {
      sourceName: "test-source",
      sourceQuestionId: `q-${seq}`,
      originalUrl: `https://example.test/questions/q-${seq}.html`,
      fetchedAt: `2026-08-13T00:00:0${seq}.000Z`,
      rawSourceFile: `test-source/q-${seq}.html`,
      rawBlockId: "",
      contentHash: `hash-${seq}`,
      rawHtmlSnippetId: null,
    },
    category: "CAT-LAW",
    classificationMethod: "rule",
    questionNumber: seq,
    questionText: `문제 ${seq} 본문`,
    choices: [
      { index: 1, text: "보기 1" },
      { index: 2, text: "보기 2" },
      { index: 3, text: "보기 3" },
      { index: 4, text: "보기 4" },
    ],
    normalizedAnswers: [1],
    explanation: null,
    explanationReference: null,
    images: [],
    validationStatus: "VALID",
    validationErrors: [],
    contentFingerprint: `fp-${seq}`,
  };
  return { ...base, ...overrides };
}

function makeMemoryStorage() {
  const files = new Map<string, string>();
  let saveCalls = 0;
  const storage: SnippetStorage = {
    async save(content) {
      saveCalls += 1;
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
  return { storage, files, getSaveCalls: () => saveCalls };
}

function makeSourceRef(sourceQuestionId: string): NormalizedQuestion["sourceRef"] {
  return {
    sourceName: "test-source",
    sourceQuestionId,
    originalUrl: `https://example.test/questions/${sourceQuestionId}.html`,
    fetchedAt: "2026-08-13T00:00:00.000Z",
    rawSourceFile: `test-source/${sourceQuestionId}.html`,
    rawBlockId: "",
    contentHash: `hash-${sourceQuestionId}`,
    rawHtmlSnippetId: null,
  };
}

function membersOf(fake: FakePersistDb, groupId: string): string[] {
  return fake.store.duplicateMembers
    .filter((m) => m.groupId === groupId)
    .map((m) => m.candidateQuestionId);
}

describe("persistCandidateQuestion", () => {
  it("VALID 후보는 candidate 저장 + review 없음 + snippet id 연결", async () => {
    const fake = createFakePersistDb();
    const { storage, files } = makeMemoryStorage();
    const question = makeQuestion();
    const html = "<div>문제</div>";

    const result = await persistCandidateQuestion(
      { question, rawHtmlSnippet: html },
      { db: fake.db, storage },
    );

    expect(result.created).toBe(true);
    expect(result.reviewPending).toBe(false);
    expect(result.isDuplicate).toBe(false);
    expect(result.duplicateGroupId).toBeNull();
    expect(result.rawHtmlSnippetId).toBe(computeSnippetId(html));

    expect(fake.store.candidateQuestions).toHaveLength(1);
    const row = fake.store.candidateQuestions[0];
    expect(row.sourceName).toBe(question.sourceRef.sourceName);
    expect(row.sourceQuestionId).toBe(question.sourceRef.sourceQuestionId);
    expect(row.rawHtmlSnippetId).toBe(computeSnippetId(html));
    expect(row.validationStatus).toBe("VALID");
    expect(row.contentFingerprint).toBe(question.contentFingerprint);

    expect(files.get(computeSnippetId(html))).toBe(html);
    expect(fake.store.candidateReviews).toHaveLength(0);
    expect(fake.store.duplicateGroups).toHaveLength(0);
  });

  it("REVIEW_REQUIRED 후보는 PENDING review를 만든다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();
    const question = makeQuestion({
      validationStatus: "REVIEW_REQUIRED",
      validationErrors: ["answer_missing"],
    });

    const result = await persistCandidateQuestion(
      { question, rawHtmlSnippet: "<div>x</div>" },
      { db: fake.db, storage },
    );

    expect(result.reviewPending).toBe(true);
    expect(fake.store.candidateReviews).toHaveLength(1);
    const review = fake.store.candidateReviews[0];
    expect(review.reviewStatus).toBe("PENDING");
    expect(review.candidateQuestionId).toBe(result.candidateId);
    expect(review.validationErrors).toEqual(["answer_missing"]);
  });

  it("REJECTED 후보도 PENDING review를 만든다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();
    const question = makeQuestion({
      validationStatus: "REJECTED",
      validationErrors: ["identity_rejected"],
    });

    const result = await persistCandidateQuestion(
      { question, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );

    expect(result.reviewPending).toBe(true);
    expect(fake.store.candidateReviews[0].reviewStatus).toBe("PENDING");
  });

  it("동일 후보 재수집은 idempotent하다 (created=false, 레코드 1개)", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();
    const question = makeQuestion();
    const html = "<div>문제</div>";

    const first = await persistCandidateQuestion(
      { question, rawHtmlSnippet: html },
      { db: fake.db, storage },
    );
    const second = await persistCandidateQuestion(
      { question, rawHtmlSnippet: html },
      { db: fake.db, storage },
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.candidateId).toBe(first.candidateId);
    expect(fake.store.candidateQuestions).toHaveLength(1);
    expect(fake.store.candidateReviews).toHaveLength(0);
  });

  it("snippet이 null이면 rawHtmlSnippetId null이고 저장하지 않는다", async () => {
    const fake = createFakePersistDb();
    const { storage, getSaveCalls } = makeMemoryStorage();
    const question = makeQuestion();

    const result = await persistCandidateQuestion(
      { question, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );

    expect(result.rawHtmlSnippetId).toBeNull();
    expect(getSaveCalls()).toBe(0);
    expect(fake.store.candidateQuestions[0].rawHtmlSnippetId).toBeNull();
  });

  it("빈/공백 snippet도 null로 처리한다", async () => {
    const fake = createFakePersistDb();
    const { storage, getSaveCalls } = makeMemoryStorage();

    const result = await persistCandidateQuestion(
      { question: makeQuestion(), rawHtmlSnippet: "   " },
      { db: fake.db, storage },
    );

    expect(result.rawHtmlSnippetId).toBeNull();
    expect(getSaveCalls()).toBe(0);
  });

  it("같은 rawHtmlSnippet은 동일 id로 저장소에 재사용된다", async () => {
    const fake = createFakePersistDb();
    const { storage, files, getSaveCalls } = makeMemoryStorage();
    const html = "<div>공용 snippet</div>";

    const q1 = makeQuestion();
    const q2 = makeQuestion();
    const r1 = await persistCandidateQuestion(
      { question: q1, rawHtmlSnippet: html },
      { db: fake.db, storage },
    );
    const r2 = await persistCandidateQuestion(
      { question: q2, rawHtmlSnippet: html },
      { db: fake.db, storage },
    );

    expect(r1.rawHtmlSnippetId).toBe(computeSnippetId(html));
    expect(r2.rawHtmlSnippetId).toBe(r1.rawHtmlSnippetId);
    expect(getSaveCalls()).toBe(2);
    expect(files.size).toBe(1);
    expect(files.get(computeSnippetId(html))).toBe(html);
  });

  it("동일 contentFingerprint 후보 2개는 duplicate 그룹이 만들어진다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();

    const q1 = makeQuestion({ contentFingerprint: "same-fp" });
    const q2 = makeQuestion({ contentFingerprint: "same-fp" });
    const r1 = await persistCandidateQuestion(
      { question: q1, rawHtmlSnippet: "<div>1</div>" },
      { db: fake.db, storage },
    );
    const r2 = await persistCandidateQuestion(
      { question: q2, rawHtmlSnippet: "<div>2</div>" },
      { db: fake.db, storage },
    );

    expect(r1.isDuplicate).toBe(false);
    expect(r1.duplicateGroupId).toBeNull();

    expect(r2.isDuplicate).toBe(true);
    expect(r2.duplicateGroupId).toBeTruthy();
    const group = fake.store.duplicateGroups.find(
      (g) => g.id === r2.duplicateGroupId,
    );
    expect(group.fingerprint).toBe("same-fp");
    expect(group.isResolved).toBe(false);
    expect(group.masterCandidateId).toBeNull();
    expect(
      fake.store.duplicateMembers.filter((m) => m.groupId === group.id),
    ).toHaveLength(2);
  });

  it("세 번째 동일 fingerprint 후보는 기존 그룹에 멤버로 추가된다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();

    for (let i = 0; i < 3; i += 1) {
      const q = makeQuestion({ contentFingerprint: "triple-fp" });
      await persistCandidateQuestion(
        { question: q, rawHtmlSnippet: `<div>${i}</div>` },
        { db: fake.db, storage },
      );
    }

    expect(fake.store.duplicateGroups).toHaveLength(1);
    const group = fake.store.duplicateGroups[0];
    expect(
      fake.store.duplicateMembers.filter((m) => m.groupId === group.id),
    ).toHaveLength(3);
  });

  it("서로 다른 fingerprint는 duplicate로 취급하지 않는다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();

    const q1 = makeQuestion({ contentFingerprint: "fp-a" });
    const q2 = makeQuestion({ contentFingerprint: "fp-b" });
    const r1 = await persistCandidateQuestion(
      { question: q1, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );
    const r2 = await persistCandidateQuestion(
      { question: q2, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );

    expect(r1.isDuplicate).toBe(false);
    expect(r2.isDuplicate).toBe(false);
    expect(fake.store.duplicateGroups).toHaveLength(0);
  });

  it("같은 후보 재수집 시 자기 자신을 duplicate로 만들지 않는다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();
    const question = makeQuestion({ contentFingerprint: "fp-self" });

    await persistCandidateQuestion(
      { question, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );
    const second = await persistCandidateQuestion(
      { question, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );

    expect(second.isDuplicate).toBe(false);
    expect(second.duplicateGroupId).toBeNull();
    expect(fake.store.duplicateGroups).toHaveLength(0);
    expect(fake.store.duplicateMembers).toHaveLength(0);
  });

  it("multi-question 파생 id(LAW-001-1/2)는 각각 독립된 candidate로 저장된다", async () => {
    const fake = createFakePersistDb();
    const { storage } = makeMemoryStorage();

    const q1 = makeQuestion({
      sourceRef: {
        sourceName: "law",
        sourceQuestionId: "LAW-001-1",
        originalUrl: "https://example.test/questions/LAW-001.html",
        fetchedAt: "2026-08-13T00:00:00.000Z",
        rawSourceFile: "law/LAW-001.html",
        rawBlockId: "",
        contentHash: "hash-1",
        rawHtmlSnippetId: null,
      },
      contentFingerprint: "fp-1",
    });
    const q2 = makeQuestion({
      sourceRef: {
        sourceName: "law",
        sourceQuestionId: "LAW-001-2",
        originalUrl: "https://example.test/questions/LAW-001.html",
        fetchedAt: "2026-08-13T00:00:00.000Z",
        rawSourceFile: "law/LAW-001.html",
        rawBlockId: "",
        contentHash: "hash-2",
        rawHtmlSnippetId: null,
      },
      contentFingerprint: "fp-2",
    });

    const r1 = await persistCandidateQuestion(
      { question: q1, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );
    const r2 = await persistCandidateQuestion(
      { question: q2, rawHtmlSnippet: null },
      { db: fake.db, storage },
    );

    expect(fake.store.candidateQuestions).toHaveLength(2);
    expect(r1.candidateId).not.toBe(r2.candidateId);
    const ids = fake.store.candidateQuestions.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  describe("STEP 6.1 provenance 저장", () => {
    it("CandidateQuestion에 originalUrl/fetchedAt을 저장한다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const question = makeQuestion();

      const result = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );

      const row = fake.store.candidateQuestions.find(
        (c) => c.id === result.candidateId,
      );
      expect(row.originalUrl).toBe(question.sourceRef.originalUrl);
      expect(row.fetchedAt).toBe(question.sourceRef.fetchedAt);
      expect(row.sourceName).toBe(question.sourceRef.sourceName);
      expect(row.sourceQuestionId).toBe(question.sourceRef.sourceQuestionId);
    });

    it("STEP 3→4→5→6 연쇄: originalUrl/fetchedAt이 동일하게 유지된다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const sourceRef = {
        sourceName: "LAW",
        sourceQuestionId: "LAW-001",
        originalUrl: "https://example.test/questions/LAW-001.html",
        fetchedAt: "2026-08-13T03:04:05.000Z",
        rawSourceFile: "LAW/LAW-001.html",
        rawBlockId: "",
        contentHash: "deadbeef",
      };
      const html = `<div class="question"><h3>문제 1</h3>
        <p>화물차 적재중량 초과의 조치는?</p>
        <ol class="options"><li>면허취소</li><li>행정처분</li><li>없음</li><li>예외</li></ol>
        <div class="answer">정답: ②</div></div>`;

      const [extracted] = extractQuestionsFromHtml({
        html,
        sourceName: "LAW",
        sourceQuestionId: "LAW-001",
        sourceRef,
      });
      const snippet = extracted.rawHtmlSnippet;
      if (snippet === null) {
        throw new Error("단일 container라도 rawHtmlSnippet이 존재해야 한다");
      }
      const normalized = normalizeQuestion(extracted);
      const result = await persistCandidateQuestion(
        { question: normalized, rawHtmlSnippet: snippet },
        { db: fake.db, storage },
      );

      const row = fake.store.candidateQuestions.find(
        (c) => c.id === result.candidateId,
      );
      expect(row.originalUrl).toBe(
        "https://example.test/questions/LAW-001.html",
      );
      expect(row.fetchedAt).toBe("2026-08-13T03:04:05.000Z");
      expect(row.rawHtmlSnippetId).toBe(computeSnippetId(snippet));
    });
  });

  describe("STEP 6.2 review 상태 유지/재개", () => {
    it("동일 데이터 재실행 시 기존 RESOLVED review를 보존한다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const question = makeQuestion({
        validationStatus: "REVIEW_REQUIRED",
        validationErrors: ["answer_missing"],
      });

      const first = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(first.reviewPending).toBe(true);

      fake.store.candidateReviews[0].reviewStatus = "RESOLVED";
      fake.store.candidateReviews[0].resolvedAt = new Date();

      const second = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(second.contentChanged).toBe(false);
      expect(second.reviewPending).toBe(false);
      expect(fake.store.candidateReviews[0].reviewStatus).toBe("RESOLVED");
    });

    it("실제 내용 변경(fingerprint 변경) 시 review를 PENDING으로 재개한다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const question = makeQuestion({
        validationStatus: "REVIEW_REQUIRED",
        validationErrors: ["answer_missing"],
        contentFingerprint: "fp-old",
      });

      const first = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(first.reviewPending).toBe(true);
      fake.store.candidateReviews[0].reviewStatus = "RESOLVED";
      fake.store.candidateReviews[0].resolvedAt = new Date();

      const changed = {
        ...question,
        contentFingerprint: "fp-new",
        validationErrors: ["answer_missing", "category_unclassified"],
      };
      const second = await persistCandidateQuestion(
        { question: changed, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );

      expect(second.contentChanged).toBe(true);
      expect(second.reviewPending).toBe(true);
      expect(fake.store.candidateReviews[0].reviewStatus).toBe("PENDING");
      expect(fake.store.candidateReviews[0].resolvedAt).toBeNull();
      expect(fake.store.candidateReviews[0].validationErrors).toEqual([
        "answer_missing",
        "category_unclassified",
      ]);
    });

    it("contentChanged: 신규/동일/변경 시각을 올바르게 반환한다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const question = makeQuestion();

      const first = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(first.created).toBe(true);
      expect(first.contentChanged).toBe(false);

      const second = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(second.created).toBe(false);
      expect(second.contentChanged).toBe(false);

      const third = await persistCandidateQuestion(
        { question: { ...question, contentFingerprint: "fp-x" }, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(third.created).toBe(false);
      expect(third.contentChanged).toBe(true);
    });

    it("choices key 순서가 달라도(JSONB 알파벳순 재배열) 동일 내용으로 판정한다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();
      const question = makeQuestion();

      const first = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(first.contentChanged).toBe(false);

      // Postgres JSONB는 객체 key를 재배열해 {index,text} 대신 {text,index}로 반환한다.
      // 이후 재수집이 동일 내용이면 contentChanged=false여야 한다.
      fake.store.candidateQuestions[0].choices = question.choices.map((c) => ({
        text: c.text,
        index: c.index,
      }));

      const second = await persistCandidateQuestion(
        { question, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(second.created).toBe(false);
      expect(second.contentChanged).toBe(false);

      // 실제 내용이 바뀐 경우는 여전히 감지된다
      const changed = { ...question, questionText: "다른 본문" };
      const third = await persistCandidateQuestion(
        { question: changed, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(third.contentChanged).toBe(true);
    });
  });

  describe("STEP 6 hardening — duplicate group stale 방지", () => {
    it("A. fingerprint 변경(AAA→BBB) 시 이전 그룹에서 제거되고 새 그룹 member가 된다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      const a1 = makeQuestion({
        sourceRef: makeSourceRef("LAW-001"),
        contentFingerprint: "AAA",
      });
      const a2 = makeQuestion({
        sourceRef: makeSourceRef("LAW-002"),
        contentFingerprint: "AAA",
      });
      const r1 = await persistCandidateQuestion(
        { question: a1, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: a2, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const aaag = fake.store.duplicateGroups.find((g) => g.fingerprint === "AAA");
      expect(aaag).toBeTruthy();
      expect(membersOf(fake, aaag.id)).toHaveLength(2);

      const b1 = makeQuestion({
        sourceRef: makeSourceRef("LAW-003"),
        contentFingerprint: "BBB",
      });
      const b2 = makeQuestion({
        sourceRef: makeSourceRef("LAW-004"),
        contentFingerprint: "BBB",
      });
      await persistCandidateQuestion(
        { question: b1, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: b2, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const bbbg = fake.store.duplicateGroups.find((g) => g.fingerprint === "BBB");
      expect(membersOf(fake, bbbg.id)).toHaveLength(2);

      const changed = { ...a1, contentFingerprint: "BBB" };
      const result = await persistCandidateQuestion(
        { question: changed, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(result.contentChanged).toBe(true);

      const a1Row = fake.store.candidateQuestions.find((c) => c.id === r1.candidateId);
      expect(a1Row.contentFingerprint).toBe("BBB");
      expect(membersOf(fake, aaag.id)).not.toContain(r1.candidateId);
      expect(membersOf(fake, bbbg.id)).toContain(r1.candidateId);
      expect(membersOf(fake, aaag.id)).toHaveLength(1);
      expect(membersOf(fake, bbbg.id)).toHaveLength(3);
    });

    it("B. fingerprint 변경 시 이전 그룹에는 다른 후보만 남는다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      const a = makeQuestion({
        sourceRef: makeSourceRef("LAW-001"),
        contentFingerprint: "AAA",
      });
      const b = makeQuestion({
        sourceRef: makeSourceRef("LAW-002"),
        contentFingerprint: "AAA",
      });
      const ra = await persistCandidateQuestion(
        { question: a, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: b, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const aaag = fake.store.duplicateGroups.find((g) => g.fingerprint === "AAA");
      expect(membersOf(fake, aaag.id)).toHaveLength(2);

      const changed = { ...a, contentFingerprint: "BBB" };
      await persistCandidateQuestion(
        { question: changed, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );

      const remaining = membersOf(fake, aaag.id);
      expect(remaining).toHaveLength(1);
      expect(remaining).not.toContain(ra.candidateId);
      // A는 BBB 피어가 없으므로 어떤 그룹에도 속하지 않는다 (stale membership 없음)
      expect(
        fake.store.duplicateMembers.some((m) => m.candidateQuestionId === ra.candidateId),
      ).toBe(false);
    });

    it("C. 마지막 member가 빠져 비어버린 그룹은 삭제된다 (stale 그룹 누적 없음)", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      const a = makeQuestion({
        sourceRef: makeSourceRef("LAW-001"),
        contentFingerprint: "AAA",
      });
      const b = makeQuestion({
        sourceRef: makeSourceRef("LAW-002"),
        contentFingerprint: "AAA",
      });
      const ra = await persistCandidateQuestion(
        { question: a, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: b, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const aaag = fake.store.duplicateGroups.find((g) => g.fingerprint === "AAA");

      // B가 먼저 CCC로 이동 → AAA에는 A만 남음
      await persistCandidateQuestion(
        { question: { ...b, contentFingerprint: "CCC" }, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      expect(membersOf(fake, aaag.id)).toHaveLength(1);

      // A가 BBB로 이동 → AAA는 비어 삭제된다
      const changed = { ...a, contentFingerprint: "BBB" };
      await persistCandidateQuestion(
        { question: changed, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );

      expect(fake.store.duplicateGroups.find((g) => g.fingerprint === "AAA")).toBeUndefined();
      expect(
        fake.store.duplicateMembers.filter((m) => m.groupId === aaag.id),
      ).toHaveLength(0);
      expect(
        fake.store.candidateQuestions.some((c) => c.id === ra.candidateId),
      ).toBe(true);
    });

    it("D. 동일 fingerprint 재실행 시 membership이 중복 생성되지 않는다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      const a = makeQuestion({
        sourceRef: makeSourceRef("LAW-001"),
        contentFingerprint: "AAA",
      });
      const b = makeQuestion({
        sourceRef: makeSourceRef("LAW-002"),
        contentFingerprint: "AAA",
      });
      await persistCandidateQuestion(
        { question: a, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: b, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const aaag = fake.store.duplicateGroups.find((g) => g.fingerprint === "AAA");
      expect(membersOf(fake, aaag.id)).toHaveLength(2);

      // fingerprint 불변 재실행 → membership 변경 없음
      await persistCandidateQuestion(
        { question: a, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: b, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );

      expect(fake.store.duplicateGroups).toHaveLength(1);
      expect(fake.store.duplicateMembers).toHaveLength(2);
      expect(membersOf(fake, aaag.id)).toHaveLength(2);
    });

    it("E. transaction 중간 실패 시 candidate update와 membership 변경이 부분 적용되지 않는다", async () => {
      const fake = createFakePersistDb();
      const { storage } = makeMemoryStorage();

      const a = makeQuestion({
        sourceRef: makeSourceRef("LAW-001"),
        contentFingerprint: "AAA",
      });
      const b = makeQuestion({
        sourceRef: makeSourceRef("LAW-002"),
        contentFingerprint: "AAA",
      });
      const ra = await persistCandidateQuestion(
        { question: a, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: b, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const aaag = fake.store.duplicateGroups.find((g) => g.fingerprint === "AAA");

      const c = makeQuestion({
        sourceRef: makeSourceRef("LAW-003"),
        contentFingerprint: "BBB",
      });
      const d = makeQuestion({
        sourceRef: makeSourceRef("LAW-004"),
        contentFingerprint: "BBB",
      });
      await persistCandidateQuestion(
        { question: c, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      await persistCandidateQuestion(
        { question: d, rawHtmlSnippet: null },
        { db: fake.db, storage },
      );
      const bbbg = fake.store.duplicateGroups.find((g) => g.fingerprint === "BBB");

      // 새 그룹 membership 등록(createMany) 단계에서 강제 실패
      const originalCreateMany =
        fake.db.candidateDuplicateMember.createMany.bind(fake.db.candidateDuplicateMember);
      fake.db.candidateDuplicateMember.createMany = async () => {
        throw new Error("mock txn failure");
      };
      try {
        const changed = { ...a, contentFingerprint: "BBB" };
        await expect(
          persistCandidateQuestion(
            { question: changed, rawHtmlSnippet: null },
            { db: fake.db, storage },
          ),
        ).rejects.toThrow("mock txn failure");
      } finally {
        fake.db.candidateDuplicateMember.createMany = originalCreateMany;
      }

      // 롤백: candidate update와 membership 변경 모두 반영되지 않아야 한다
      const aRow = fake.store.candidateQuestions.find((c) => c.id === ra.candidateId);
      expect(aRow.contentFingerprint).toBe("AAA");
      expect(membersOf(fake, aaag.id)).toHaveLength(2);
      expect(membersOf(fake, bbbg.id)).toHaveLength(2);
      expect(
        fake.store.duplicateMembers.filter((m) => m.candidateQuestionId === ra.candidateId),
      ).toHaveLength(1);
    });
  });

  describe("STEP 6 hardening — parse failure No Drop", () => {
    it("STEP 4 파싱 실패도 REJECTED Candidate로 저장되고 raw HTML snippet이 보존된다", async () => {
      const fake = createFakePersistDb();
      const { storage, files } = makeMemoryStorage();
      const sourceRef = {
        sourceName: "LAW",
        sourceQuestionId: "LAW-999",
        originalUrl: "https://example.test/questions/LAW-999.html",
        fetchedAt: "2026-08-13T03:04:05.000Z",
        rawSourceFile: "LAW/LAW-999.html",
        rawBlockId: "",
        contentHash: "c0ffee",
      };
      // 문제 container도 본문 텍스트도 없는 파싱 실패 HTML
      const html = `<div class="page"><img src="https://cdn.example.com/only-image.png" alt="x"></div>`;

      const [extracted] = extractQuestionsFromHtml({
        html,
        sourceName: "LAW",
        sourceQuestionId: "LAW-999",
        sourceRef,
      });
      expect(extracted.extractionStatus).toBe("failed");

      const normalized = normalizeQuestion(extracted);
      expect(normalized.validationStatus).toBe("REJECTED");
      expect(normalized.validationErrors).toContain("extraction_failed");

      const snippet = extracted.rawHtmlSnippet;
      if (snippet === null) {
        throw new Error("파싱 실패여도 rawHtmlSnippet은 보존되어야 한다");
      }
      const result = await persistCandidateQuestion(
        { question: normalized, rawHtmlSnippet: snippet },
        { db: fake.db, storage },
      );

      expect(result.created).toBe(true);
      expect(result.reviewPending).toBe(true);
      const row = fake.store.candidateQuestions.find((c) => c.id === result.candidateId);
      expect(row.validationStatus).toBe("REJECTED");
      expect(row.questionText).toBe("");
      expect(row.originalUrl).toBe("https://example.test/questions/LAW-999.html");
      expect(row.rawHtmlSnippetId).toBe(computeSnippetId(snippet));
      expect(files.has(computeSnippetId(snippet))).toBe(true);
    });
  });
});
