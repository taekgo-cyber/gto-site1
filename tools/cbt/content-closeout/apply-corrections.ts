import "dotenv/config";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { CBT_LAUNCH_CONTENT_CORRECTIONS, type ContentCorrection, type ContentPatch } from "./corrections";

type Choice = { index: number; text: string };

type EditableContent = {
  questionText: string;
  choices: Choice[];
  explanation: string | null;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLocalCorrectionBoundary(environment: NodeJS.ProcessEnv = process.env): URL {
  if (environment.NODE_ENV === "production") throw new Error("cbt_content_correction_production_forbidden");
  const raw = environment.DATABASE_URL?.trim();
  if (!raw) throw new Error("cbt_content_correction_database_url_required");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("cbt_content_correction_database_url_invalid");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("cbt_content_correction_database_url_invalid");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("cbt_content_correction_loopback_required");
  }
  return parsed;
}

function cloneChoices(value: unknown): Choice[] {
  if (!Array.isArray(value)) throw new Error("cbt_content_correction_choices_invalid");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("cbt_content_correction_choice_invalid");
    const row = entry as Record<string, unknown>;
    if (!Number.isInteger(row.index) || typeof row.text !== "string") {
      throw new Error("cbt_content_correction_choice_invalid");
    }
    return { index: row.index as number, text: row.text };
  });
}

function applyPatch(content: EditableContent, patch: ContentPatch): void {
  if (patch.field === "questionText") {
    if (content.questionText !== patch.from) throw new Error("cbt_content_correction_question_before_mismatch");
    content.questionText = patch.to;
    return;
  }
  if (patch.field === "explanation") {
    if (content.explanation !== patch.from) throw new Error("cbt_content_correction_explanation_before_mismatch");
    content.explanation = patch.to;
    return;
  }
  const choice = content.choices.find((item) => item.index === patch.index);
  if (!choice || choice.text !== patch.from) throw new Error("cbt_content_correction_choice_before_mismatch");
  choice.text = patch.to;
}

export function correctedContent(
  current: EditableContent,
  correction: ContentCorrection,
): EditableContent {
  const next: EditableContent = {
    questionText: current.questionText,
    choices: current.choices.map((item) => ({ ...item })),
    explanation: current.explanation,
  };
  for (const patch of correction.patches) applyPatch(next, patch);
  return next;
}

function sameContent(left: EditableContent, right: EditableContent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadCorrectionRows(repository = prisma) {
  const ids = CBT_LAUNCH_CONTENT_CORRECTIONS.map((item) => item.masterQuestionId);
  const rows = await repository.masterQuestion.findMany({
    where: { id: { in: ids } },
    include: { generatedQuestion: { include: { candidateQuestion: true } } },
  });
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !found.has(id));
    throw new Error(`cbt_content_correction_master_missing:${missing.join(",")}`);
  }
  return rows;
}

async function plan() {
  assertLocalCorrectionBoundary();
  const rows = await loadCorrectionRows();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = CBT_LAUNCH_CONTENT_CORRECTIONS.map((correction) => {
    const row = byId.get(correction.masterQuestionId)!;
    if (row.generatedQuestion.status !== "APPROVED") {
      throw new Error(`cbt_content_correction_generated_not_approved:${row.id}`);
    }
    if (row.generatedQuestion.candidateQuestion.sourceQuestionId !== correction.sourceQuestionId) {
      throw new Error(`cbt_content_correction_source_identity_mismatch:${row.id}`);
    }
    const before: EditableContent = {
      questionText: row.questionText,
      choices: cloneChoices(row.choices),
      explanation: row.explanation,
    };
    let after: EditableContent;
    try {
      after = correctedContent(before, correction);
    } catch (error) {
      // Idempotent rerun: if every target already equals its desired `to`, report NO_OP.
      const already = correction.patches.every((patch) => {
        if (patch.field === "questionText") return before.questionText === patch.to;
        if (patch.field === "explanation") return before.explanation === patch.to;
        return before.choices.find((choice) => choice.index === patch.index)?.text === patch.to;
      });
      if (!already) throw error;
      after = before;
    }
    return {
      masterQuestionId: row.id,
      sourceQuestionId: correction.sourceQuestionId,
      reason: correction.reason,
      action: sameContent(before, after) ? "NO_OP" as const : "UPDATE" as const,
      before,
      after,
    };
  });
  return {
    version: "cbt-launch-content-closeout-v1",
    targetCount: items.length,
    wouldUpdate: items.filter((item) => item.action === "UPDATE").length,
    wouldNoOp: items.filter((item) => item.action === "NO_OP").length,
    dbWrite: false,
    items,
  };
}

async function applyLocal() {
  assertLocalCorrectionBoundary();
  const beforePlan = await plan();
  const targetIds = new Set(CBT_LAUNCH_CONTENT_CORRECTIONS.map((item) => item.masterQuestionId));
  const [masterBefore, generatedBefore, candidateBefore] = await Promise.all([
    prisma.masterQuestion.findMany({ select: { id: true, updatedAt: true } }),
    prisma.generatedQuestion.findMany({ select: { id: true, updatedAt: true } }),
    prisma.candidateQuestion.findMany({ select: { id: true, updatedAt: true } }),
  ]);

  const updated = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const item of beforePlan.items) {
      if (item.action !== "UPDATE") continue;
      const result = await tx.masterQuestion.updateMany({
        where: { id: item.masterQuestionId },
        data: {
          questionText: item.after.questionText,
          choices: item.after.choices as unknown as Prisma.InputJsonValue,
          explanation: item.after.explanation,
        },
      });
      if (result.count !== 1) throw new Error(`cbt_content_correction_update_count_invalid:${item.masterQuestionId}`);
      count += 1;
    }
    return count;
  });

  const afterPlan = await plan();
  if (afterPlan.wouldUpdate !== 0 || afterPlan.wouldNoOp !== CBT_LAUNCH_CONTENT_CORRECTIONS.length) {
    throw new Error("cbt_content_correction_readback_failed");
  }

  const [masterAfter, generatedAfter, candidateAfter] = await Promise.all([
    prisma.masterQuestion.findMany({ select: { id: true, updatedAt: true } }),
    prisma.generatedQuestion.findMany({ select: { id: true, updatedAt: true } }),
    prisma.candidateQuestion.findMany({ select: { id: true, updatedAt: true } }),
  ]);
  if (masterBefore.length !== masterAfter.length || generatedBefore.length !== generatedAfter.length || candidateBefore.length !== candidateAfter.length) {
    throw new Error("cbt_content_correction_table_count_changed");
  }
  const beforeMasterTimes = new Map(masterBefore.map((row) => [row.id, row.updatedAt.toISOString()]));
  for (const row of masterAfter) {
    if (!targetIds.has(row.id) && beforeMasterTimes.get(row.id) !== row.updatedAt.toISOString()) {
      throw new Error(`cbt_content_correction_unexpected_master_mutation:${row.id}`);
    }
  }
  const unchanged = (before: { id: string; updatedAt: Date }[], after: { id: string; updatedAt: Date }[], label: string) => {
    const map = new Map(before.map((row) => [row.id, row.updatedAt.toISOString()]));
    for (const row of after) {
      if (map.get(row.id) !== row.updatedAt.toISOString()) throw new Error(`cbt_content_correction_unexpected_${label}_mutation:${row.id}`);
    }
  };
  unchanged(generatedBefore, generatedAfter, "generated");
  unchanged(candidateBefore, candidateAfter, "candidate");

  return {
    version: beforePlan.version,
    requestedTargets: beforePlan.targetCount,
    updated,
    noOp: beforePlan.wouldNoOp,
    readBackNoOp: afterPlan.wouldNoOp,
    masterCount: masterAfter.length,
    generatedCount: generatedAfter.length,
    candidateCount: candidateAfter.length,
    unexpectedMasterMutation: 0,
    generatedMutation: 0,
    candidateMutation: 0,
    productionWrite: false,
  };
}

async function main() {
  const apply = process.argv.includes("--apply-local");
  const result = apply ? await applyLocal() : await plan();
  console.log(JSON.stringify(result, null, 2));
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
