// STEP 10 — Dataset Audit (STEP 10 PLAN §8).
// MasterQuestion 데이터셋 무결성 검사. 완전한 read-only (findMany만 사용).
// 쓰기 메서드를 일절 호출하지 않는다.
// error 레벨 finding이 1건 이상이면 CLI에서 exit code 1로 반환한다.
import type {
  CandidateQuestion,
  GeneratedQuestion,
  MasterQuestion,
  Prisma,
} from "@/generated/prisma/client";
import type { GeneratedQuestionStatus } from "../content/types";

// ---------------------------------------------------------------------------
// 최소 DB 인터페이스 (read-only). 기존 ContentDb 수정 없이 자체 정의한다.
// ---------------------------------------------------------------------------

export type AuditDb = {
  masterQuestion: {
    findMany(
      args?: Prisma.MasterQuestionFindManyArgs,
    ): Promise<MasterQuestion[]>;
  };
  generatedQuestion: {
    findMany(
      args?: Prisma.GeneratedQuestionFindManyArgs,
    ): Promise<GeneratedQuestion[]>;
  };
  candidateQuestion: {
    findMany(
      args?: Prisma.CandidateQuestionFindManyArgs,
    ): Promise<CandidateQuestion[]>;
  };
};

/** 기본 DB (실제 Prisma). CLI/운영에서 사용 */
export async function getDefaultAuditDb(): Promise<AuditDb> {
  const mod = await import("@/lib/prisma");
  return mod.prisma as unknown as AuditDb;
}

// ---------------------------------------------------------------------------
// Finding / Report 타입
// ---------------------------------------------------------------------------

export type AuditLevel = "error" | "warning";

export type AuditFinding = {
  level: AuditLevel;
  code: string;
  message: string;
  masterQuestionId?: string;
  generatedQuestionId?: string;
};

export type AuditReport = {
  totalMasters: number;
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
  inactiveMasters: number;
  approvedNotPromoted: number;
  findings: AuditFinding[];
};

// ---------------------------------------------------------------------------
// 형식 검증 헬퍼
// ---------------------------------------------------------------------------

type MasterChoice = { index?: unknown; text?: unknown };

function isIntArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === "number" && Number.isInteger(v))
  );
}

function validateChoices(
  value: unknown,
  finding: (msg: string) => void,
): number {
  if (!Array.isArray(value)) {
    finding("choices가 배열이 아닙니다.");
    return 0;
  }
  if (value.length === 0) {
    finding("choices가 비어 있습니다.");
    return 0;
  }
  if (value.length !== 4) {
    finding(`choices 개수가 ${value.length}개 (표준 4지선다 아님).`);
  }
  const indices = value.map((c) => (c as MasterChoice)?.index);
  const texts = value.map((c) => (c as MasterChoice)?.text);
  const validShape = value.every(
    (c) =>
      typeof (c as MasterChoice)?.index === "number" &&
      typeof (c as MasterChoice)?.text === "string",
  );
  if (!validShape) {
    finding("choices 항목이 {index, text} 형태가 아닙니다.");
    return value.length;
  }
  texts.forEach((t, i) => {
    if (typeof t === "string" && t.trim() === "") {
      finding(`choices[${i}]의 text가 빈 문자열입니다.`);
    }
  });
  const indexSet = new Set<number>();
  for (const idx of indices as number[]) {
    if (indexSet.has(idx)) finding(`choices index 중복: ${idx}`);
    indexSet.add(idx);
  }
  for (let i = 1; i <= value.length; i += 1) {
    if (!indexSet.has(i)) finding(`choices index 누락: ${i}`);
  }
  return value.length;
}

function validateAnswers(
  value: unknown,
  choiceCount: number,
  finding: (msg: string) => void,
): void {
  if (!isIntArray(value)) {
    finding("answers가 정수 배열이 아닙니다.");
    return;
  }
  if (value.some((v) => v < 1 || v > choiceCount)) {
    finding(`answers 인덱스가 보기 범위(1..${choiceCount})를 벗어납니다.`);
  }
  const set = new Set<number>();
  for (const v of value) {
    if (set.has(v)) finding(`answers 중복 인덱스: ${v}`);
    set.add(v);
  }
}

// ---------------------------------------------------------------------------
// 메인 audit
// ---------------------------------------------------------------------------

export async function runDatasetAudit(
  db?: AuditDb,
): Promise<AuditReport> {
  const auditDb = db ?? (await getDefaultAuditDb());
  const [masters, generated, candidates] = await Promise.all([
    auditDb.masterQuestion.findMany(),
    auditDb.generatedQuestion.findMany(),
    auditDb.candidateQuestion.findMany(),
  ]);

  const findings: AuditFinding[] = [];
  const pushError = (
    masterQuestionId: string,
    code: string,
    message: string,
    generatedQuestionId?: string,
  ) => {
    findings.push({
      level: "error",
      code,
      message,
      masterQuestionId,
      ...(generatedQuestionId !== undefined ? { generatedQuestionId } : {}),
    });
  };
  const pushWarning = (
    code: string,
    message: string,
    masterQuestionId?: string,
  ) => {
    findings.push({
      level: "warning",
      code,
      message,
      masterQuestionId,
    });
  };

  const generatedById = new Map(generated.map((g) => [g.id, g]));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const masterByGeneratedId = new Map<string, MasterQuestion>();

  // ------------------------------------------------------------------
  // 집계
  // ------------------------------------------------------------------
  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  let inactiveMasters = 0;

  for (const m of masters) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    byDifficulty[m.difficulty] = (byDifficulty[m.difficulty] ?? 0) + 1;
    if (!m.isActive) inactiveMasters += 1;
    masterByGeneratedId.set(m.generatedQuestionId, m);
  }

  // ------------------------------------------------------------------
  // duplicate generatedQuestionId (unique constraint로 사실상 불가 — defense-in-depth)
  // ------------------------------------------------------------------
  const seenGenerated = new Set<string>();
  for (const m of masters) {
    if (seenGenerated.has(m.generatedQuestionId)) {
      pushError(
        m.id,
        "duplicate_generated_question",
        `동일 generatedQuestionId가 여러 Master에 존재: ${m.generatedQuestionId}`,
      );
    }
    seenGenerated.add(m.generatedQuestionId);
  }

  // ------------------------------------------------------------------
  // orphan / state violation / 내용 검사 (Master 단위)
  // ------------------------------------------------------------------
  for (const m of masters) {
    // 빈 questionText
    if (typeof m.questionText !== "string" || m.questionText.trim() === "") {
      pushError(m.id, "empty_question_text", "questionText가 비어 있습니다.");
    }

    // choices / answers 무결성
    let choiceCount = 0;
    const choices = m.choices;
    if (!Array.isArray(choices)) {
      pushError(m.id, "choices_not_array", "choices가 배열이 아닙니다.");
    } else if (choices.length === 0) {
      pushError(m.id, "choices_empty", "choices가 비어 있습니다.");
    } else {
      choiceCount = validateChoices(choices, (msg) =>
        pushError(m.id, "choices_invalid", msg),
      );
    }

    if (m.answers === undefined || m.answers === null) {
      pushError(m.id, "answers_missing", "answers가 없습니다.");
    } else {
      const answers = m.answers as unknown;
      if (Array.isArray(answers) && answers.length === 0) {
        pushError(m.id, "answers_empty", "answers가 비어 있습니다.");
      } else {
        validateAnswers(answers as unknown, choiceCount, (msg) =>
          pushError(m.id, "answers_invalid", msg),
        );
      }
    }

    // Master → Generated 관계
    const gq = generatedById.get(m.generatedQuestionId);
    if (!gq) {
      pushError(
        m.id,
        "orphan_master_generated",
        `Master가 참조하는 GeneratedQuestion이 없습니다: ${m.generatedQuestionId}`,
      );
      continue;
    }

    // state violation: 원본 GeneratedQuestion이 APPROVED가 아님
    const gqStatus = gq.status as GeneratedQuestionStatus;
    if (gqStatus !== "APPROVED") {
      pushError(
        m.id,
        "state_violation",
        `Master의 원본 GeneratedQuestion 상태가 APPROVED가 아닙니다: ${gqStatus}`,
        m.generatedQuestionId,
      );
    }

    // Master → Generated → Candidate 체인
    const candidate = candidateById.get(gq.candidateQuestionId);
    if (!candidate) {
      pushError(
        m.id,
        "orphan_generated_candidate",
        `GeneratedQuestion이 참조하는 CandidateQuestion이 없습니다: ${gq.candidateQuestionId}`,
        gq.id,
      );
      continue;
    }

    // 이미지 무결성 (Candidate.images — Master에는 이미지 필드가 없음)
    const images = Array.isArray(candidate.images) ? candidate.images : [];
    for (const img of images as { src?: unknown; resolvedSrc?: unknown }[]) {
      const src = img?.src;
      const resolvedSrc = img?.resolvedSrc;
      if ((src === undefined || src === null || String(src) === "") &&
          (resolvedSrc === undefined || resolvedSrc === null || String(resolvedSrc) === "")) {
        pushWarning(
          "image_integrity",
          `이미지의 src/resolvedSrc가 모두 비어 있습니다 (${m.id}).`,
          m.id,
        );
      }
    }

    // provenance 공백
    if (!candidate.sourceName || !candidate.sourceQuestionId) {
      pushWarning(
        "provenance_missing",
        `Candidate의 sourceName/sourceQuestionId가 비어 있습니다 (${m.id}).`,
        m.id,
      );
    }
    if (candidate.originalUrl === null || candidate.originalUrl === undefined) {
      pushWarning(
        "provenance_no_original_url",
        `Candidate의 originalUrl이 없습니다 (${m.id}).`,
        m.id,
      );
    }
  }

  // ------------------------------------------------------------------
  // 승격 누락: APPROVED인데 Master가 없는 GeneratedQuestion
  // ------------------------------------------------------------------
  let approvedNotPromoted = 0;
  for (const g of generated) {
    const status = g.status as GeneratedQuestionStatus;
    if (status === "APPROVED" && !masterByGeneratedId.has(g.id)) {
      approvedNotPromoted += 1;
    }
  }

  return {
    totalMasters: masters.length,
    byCategory,
    byDifficulty,
    inactiveMasters,
    approvedNotPromoted,
    findings,
  };
}

/** error 레벨 finding 존재 여부 (CLI exit code 결정에 사용) */
export function hasErrors(report: AuditReport): boolean {
  return report.findings.some((f) => f.level === "error");
}
