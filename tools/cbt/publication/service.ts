import { createHash } from "node:crypto";
import { CATEGORY_SUBJECT_MAP, CBT_CATEGORY_CODES, type CbtCategoryCode } from "../types";
import {
  CBT_PUBLICATION_CATEGORY_SLUG,
  CBT_PUBLICATION_SOURCE,
  CBT_PUBLICATION_VERSION,
  type PublicationAction,
  type PublicationCreateInput,
  type PublicationDatabase,
  type PublicationExecutionResult,
  type PublicationMaster,
  type PublicationMetadata,
  type PublicationPlan,
  type PublicationPlanItem,
  type PublicationRepository,
  type PublicationTarget,
  type PublicationTargetStatus,
} from "./types";

const EXPECTED_CHOICE_COUNT = 4;

type MasterValidation =
  | { ok: true; expected: PublicationCreateInput; categoryCode: CbtCategoryCode; subject: string }
  | { ok: false; reasons: string[]; categoryCode: string | null; subject: string | null };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function publicationTargetId(masterQuestionId: string): string {
  return `master_${masterQuestionId}`;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateAndMapMaster(
  master: PublicationMaster,
  categoryId: string | null,
): MasterValidation {
  const reasons: string[] = [];
  const categoryCode = (CBT_CATEGORY_CODES as readonly string[]).includes(master.category)
    ? (master.category as CbtCategoryCode)
    : null;
  const subject = categoryCode ? CATEGORY_SUBJECT_MAP[categoryCode] : null;

  if (!master.isActive) reasons.push("master_inactive");
  if (!(master.publishedAt instanceof Date) || Number.isNaN(master.publishedAt.getTime())) {
    reasons.push("master_published_at_missing");
  }
  if (master.generatedQuestionId !== master.generatedQuestion?.id) {
    reasons.push("generated_question_identity_mismatch");
  }
  if (master.generatedQuestion?.status !== "APPROVED") {
    reasons.push("generated_question_not_approved");
  }
  if (!nonEmpty(master.questionText)) reasons.push("question_text_missing");
  if (!categoryCode) reasons.push(`category_invalid:${master.category}`);
  if (!categoryId) reasons.push(`category_missing:${CBT_PUBLICATION_CATEGORY_SLUG}`);
  if (!nonEmpty(master.explanation)) reasons.push("explanation_missing");
  if (!nonEmpty(master.difficulty)) reasons.push("difficulty_missing");

  const choices = Array.isArray(master.choices) ? master.choices : [];
  if (choices.length !== EXPECTED_CHOICE_COUNT) {
    reasons.push(`choices_count_invalid:${choices.length}`);
  }
  const mappedOptions: Array<{ id: number; text: string }> = [];
  const seenChoiceIds = new Set<number>();
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") {
      reasons.push("choice_shape_invalid");
      continue;
    }
    const record = choice as Record<string, unknown>;
    if (!Number.isInteger(record.index) || !nonEmpty(record.text)) {
      reasons.push("choice_shape_invalid");
      continue;
    }
    const id = record.index as number;
    if (seenChoiceIds.has(id)) reasons.push("choice_index_duplicate");
    seenChoiceIds.add(id);
    mappedOptions.push({ id, text: record.text as string });
  }
  const sortedIds = [...seenChoiceIds].sort((left, right) => left - right);
  if (stableJson(sortedIds) !== stableJson([1, 2, 3, 4])) {
    reasons.push("choice_indexes_invalid");
  }

  const answers = Array.isArray(master.answers) ? master.answers : [];
  if (answers.length !== 1 || !Number.isInteger(answers[0])) {
    reasons.push("single_answer_required");
  }
  const correctOption = answers[0];
  if (typeof correctOption === "number" && !seenChoiceIds.has(correctOption)) {
    reasons.push("answer_out_of_range");
  }

  const generated = master.generatedQuestion;
  const candidate = generated?.candidateQuestion;
  if (!generated || !nonEmpty(generated.id) || !nonEmpty(generated.candidateQuestionId)) {
    reasons.push("generated_provenance_missing");
  }
  if (!nonEmpty(generated?.contentFingerprint)) reasons.push("generated_fingerprint_missing");
  if (!candidate || generated?.candidateQuestionId !== candidate.id) {
    reasons.push("candidate_identity_mismatch");
  }
  if (!nonEmpty(candidate?.sourceName)) reasons.push("source_name_missing");
  if (!nonEmpty(candidate?.sourceQuestionId)) reasons.push("source_question_id_missing");
  if (!nonEmpty(candidate?.contentFingerprint)) reasons.push("candidate_fingerprint_missing");

  if (reasons.length > 0 || !categoryCode || !subject || !categoryId) {
    return { ok: false, reasons: [...new Set(reasons)], categoryCode: master.category || null, subject };
  }

  const metadata: PublicationMetadata = {
    canonical: true,
    publicationVersion: CBT_PUBLICATION_VERSION,
    masterQuestionId: master.id,
    generatedQuestionId: generated.id,
    candidateQuestionId: candidate.id,
    sourceName: candidate.sourceName,
    sourceQuestionId: candidate.sourceQuestionId,
    originalUrl: candidate.originalUrl,
    generatedContentFingerprint: generated.contentFingerprint as string,
    candidateContentFingerprint: candidate.contentFingerprint,
    difficulty: master.difficulty,
  };

  return {
    ok: true,
    categoryCode,
    subject,
    expected: {
      id: publicationTargetId(master.id),
      categoryId,
      subject,
      questionText: master.questionText,
      options: mappedOptions,
      correctOption: correctOption as number,
      explanation: master.explanation,
      imageUrl: null,
      status: "DRAFT",
      source: CBT_PUBLICATION_SOURCE,
      metadata,
    },
  };
}

function targetContentMatches(target: PublicationTarget, expected: PublicationCreateInput): boolean {
  return (
    target.id === expected.id &&
    target.categoryId === expected.categoryId &&
    target.subject === expected.subject &&
    target.questionText === expected.questionText &&
    stableJson(target.options) === stableJson(expected.options) &&
    target.correctOption === expected.correctOption &&
    target.explanation === expected.explanation &&
    target.imageUrl === expected.imageUrl &&
    target.source === expected.source &&
    stableJson(target.metadata) === stableJson(expected.metadata)
  );
}

function actionForTarget(
  target: PublicationTarget | undefined,
  expected: PublicationCreateInput,
  targetStatus: PublicationTargetStatus,
): { action: PublicationAction; reasons: string[] } {
  if (!target) return { action: "CREATE", reasons: [] };
  if (!targetContentMatches(target, expected)) {
    return { action: "CONFLICT", reasons: ["existing_target_content_mismatch"] };
  }
  if (target.status === "HIDDEN") {
    return { action: "CONFLICT", reasons: ["existing_target_hidden"] };
  }
  if (targetStatus === "PUBLISHED" && target.status === "DRAFT") {
    return { action: "PUBLISH", reasons: [] };
  }
  return { action: "NO_OP", reasons: [] };
}

function buildPlanId(plan: Omit<PublicationPlan, "planId">): string {
  const payload = {
    selectedIds: plan.selectedIds,
    targetStatus: plan.targetStatus,
    items: plan.items.map((item) => ({
      masterQuestionId: item.masterQuestionId,
      targetQuestionId: item.targetQuestionId,
      action: item.action,
      reasons: item.reasons,
      expected: item.expected,
    })),
  };
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export async function planMasterPublication(
  repository: PublicationRepository,
  input: { ids: readonly string[] | null; targetStatus: PublicationTargetStatus },
): Promise<PublicationPlan> {
  const normalizedIds = input.ids ? [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))] : null;
  const [masters, category] = await Promise.all([
    repository.listMasters(normalizedIds),
    repository.findCategoryBySlug(CBT_PUBLICATION_CATEGORY_SLUG),
  ]);
  const categoryId = category?.isActive ? category.id : null;
  const byMasterId = new Map(masters.map((master) => [master.id, master]));
  const orderedIds = normalizedIds ?? masters.map((master) => master.id).sort();
  const targetIds = orderedIds.map(publicationTargetId);
  const targets = await repository.listTargets(targetIds);
  const targetById = new Map(targets.map((target) => [target.id, target]));

  const items: PublicationPlanItem[] = orderedIds.map((masterQuestionId) => {
    const master = byMasterId.get(masterQuestionId);
    const targetQuestionId = publicationTargetId(masterQuestionId);
    if (!master) {
      return {
        masterQuestionId,
        targetQuestionId,
        categoryCode: null,
        subject: null,
        action: "INVALID",
        reasons: ["master_not_found"],
        expected: null,
      };
    }

    const validation = validateAndMapMaster(master, categoryId);
    if (!validation.ok) {
      return {
        masterQuestionId,
        targetQuestionId,
        categoryCode: validation.categoryCode,
        subject: validation.subject,
        action: "INVALID",
        reasons: validation.reasons,
        expected: null,
      };
    }

    const decision = actionForTarget(targetById.get(targetQuestionId), validation.expected, input.targetStatus);
    return {
      masterQuestionId,
      targetQuestionId,
      categoryCode: validation.categoryCode,
      subject: validation.subject,
      action: decision.action,
      reasons: decision.reasons,
      expected: validation.expected,
    };
  });

  const distribution: Record<string, number> = {};
  for (const item of items) {
    if (item.action === "INVALID" || item.action === "CONFLICT" || !item.subject) continue;
    distribution[item.subject] = (distribution[item.subject] ?? 0) + 1;
  }

  const withoutId: Omit<PublicationPlan, "planId"> = {
    selectedIds: normalizedIds,
    selectedCount: orderedIds.length,
    selectedMasterCount: masters.length,
    eligibleCount: items.filter((item) => !["INVALID", "CONFLICT"].includes(item.action)).length,
    wouldCreate: items.filter((item) => item.action === "CREATE").length,
    wouldPublish:
      items.filter((item) => item.action === "PUBLISH").length +
      (input.targetStatus === "PUBLISHED" ? items.filter((item) => item.action === "CREATE").length : 0),
    wouldNoOp: items.filter((item) => item.action === "NO_OP").length,
    wouldConflict: items.filter((item) => item.action === "CONFLICT").length,
    invalidCount: items.filter((item) => item.action === "INVALID").length,
    categoryDistribution: distribution,
    targetStatus: input.targetStatus,
    dbWrite: false,
    items,
  };
  return { planId: buildPlanId(withoutId), ...withoutId };
}

function assertExecutable(plan: PublicationPlan): void {
  if (plan.selectedIds === null) throw new Error("publication_execute_requires_explicit_ids");
  if (plan.selectedIds.length === 0) throw new Error("publication_execute_requires_non_empty_ids");
  if (plan.invalidCount > 0 || plan.wouldConflict > 0) {
    throw new Error(
      `publication_plan_blocked:invalid=${plan.invalidCount},conflict=${plan.wouldConflict}`,
    );
  }
}

function assertPlanUnchanged(before: PublicationPlan, after: PublicationPlan): void {
  if (before.planId !== after.planId) throw new Error("publication_plan_changed_before_write");
}

export async function executeMasterPublication(
  database: PublicationDatabase,
  input: { ids: readonly string[]; targetStatus: PublicationTargetStatus },
): Promise<PublicationExecutionResult> {
  const initialPlan = await planMasterPublication(database, input);
  assertExecutable(initialPlan);

  return database.transaction(async (repository) => {
    const transactionPlan = await planMasterPublication(repository, input);
    assertExecutable(transactionPlan);
    assertPlanUnchanged(initialPlan, transactionPlan);

    let created = 0;
    let published = 0;
    let noOp = 0;

    for (const item of transactionPlan.items) {
      if (item.action === "NO_OP") {
        noOp += 1;
        continue;
      }
      if (!item.expected) throw new Error(`publication_expected_payload_missing:${item.masterQuestionId}`);

      if (item.action === "CREATE") {
        const createdTarget = await repository.createTarget(item.expected);
        if (!targetContentMatches(createdTarget, item.expected) || createdTarget.status !== "DRAFT") {
          throw new Error(`publication_create_readback_mismatch:${item.masterQuestionId}`);
        }
        created += 1;
        if (input.targetStatus === "PUBLISHED") {
          const updated = await repository.updateTargetStatus(item.targetQuestionId, "PUBLISHED");
          if (!targetContentMatches(updated, item.expected) || updated.status !== "PUBLISHED") {
            throw new Error(`publication_publish_readback_mismatch:${item.masterQuestionId}`);
          }
          published += 1;
        }
      } else if (item.action === "PUBLISH") {
        const updated = await repository.updateTargetStatus(item.targetQuestionId, "PUBLISHED");
        if (!targetContentMatches(updated, item.expected) || updated.status !== "PUBLISHED") {
          throw new Error(`publication_publish_readback_mismatch:${item.masterQuestionId}`);
        }
        published += 1;
      }
    }

    const expectedById = new Map(
      transactionPlan.items
        .filter((item): item is PublicationPlanItem & { expected: PublicationCreateInput } => item.expected !== null)
        .map((item) => [item.targetQuestionId, item.expected]),
    );
    const readBack = await repository.listTargets([...expectedById.keys()]);
    if (readBack.length !== expectedById.size) throw new Error("publication_post_write_count_mismatch");
    for (const target of readBack) {
      const expected = expectedById.get(target.id);
      if (!expected || !targetContentMatches(target, expected)) {
        throw new Error(`publication_post_write_content_mismatch:${target.id}`);
      }
      if (input.targetStatus === "PUBLISHED" && target.status !== "PUBLISHED") {
        throw new Error(`publication_post_write_status_mismatch:${target.id}`);
      }
    }

    return { plan: transactionPlan, created, published, noOp, postWriteVerified: true };
  });
}
