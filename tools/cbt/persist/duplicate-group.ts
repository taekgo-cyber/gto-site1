// STEP 6 — 중복 그룹 식별 (Session 10-1 STEP 6 §26, Session 10-2 hardening §1).
// 동일 contentFingerprint 후보가 2개 이상일 때만 그룹을 만든다.
// 그룹에 속해도 삭제/병합/master 승격은 하지 않는다(isResolved=false, masterCandidateId=null 유지).
//
// Stale 방지:
// - CandidateQuestion의 fingerprint가 재수집으로 인해 변경되면(AAA→BBB) 이전
//   fingerprint 그룹의 membership이 stale로 남을 수 있다. registerDuplicateIfNeeded는
//   previousFingerprint를 받아 변경 시에만 기존 그룹에서 해당 후보를 제거하고,
//   member가 0개가 된 "인간 검토 이력이 없는" 빈 그룹은 삭제한다.
// - fingerprint가 그대로면 membership을 건드리지 않는다 (불필요한 변경 금지).
// - 모든 작업은 호출부(persistCandidateQuestion)의 동일 DB transaction 안에서 수행된다.

import type { CandidateDb } from "./candidate-repository";

export type DuplicateGroupResult = {
  isDuplicate: boolean;
  groupId: string | null;
};

/**
 * 후보의 fingerprint가 이전과 달라졌을 때, 이전 fingerprint 그룹에서 해당
 * 후보의 membership을 제거한다.
 * - 다른 후보의 membership은 절대 건드리지 않는다.
 * - 제거 후 member가 0개가 되고 isResolved/master가 설정되지 않은 빈 그룹은
 *   삭제해 stale 그룹 누적을 막는다.
 *   (isResolved=true 또는 masterCandidateId가 있는 그룹은 사람이 검토한 이력이므로
 *   데이터 보존을 위해 삭제하지 않는다)
 */
async function removeStaleMembership(
  db: CandidateDb,
  candidateQuestionId: string,
  previousFingerprint: string,
): Promise<void> {
  const groups = await db.candidateDuplicateGroup.findMany({
    where: { fingerprint: previousFingerprint },
  });
  if (groups.length === 0) return;

  const groupIds = groups.map((g) => g.id);
  await db.candidateDuplicateMember.deleteMany({
    where: { candidateQuestionId, groupId: { in: groupIds } },
  });

  for (const group of groups) {
    const remaining = await db.candidateDuplicateMember.count({
      where: { groupId: group.id },
    });
    if (
      remaining === 0 &&
      !group.isResolved &&
      group.masterCandidateId === null
    ) {
      await db.candidateDuplicateGroup.delete({ where: { id: group.id } });
    }
  }
}

export async function registerDuplicateIfNeeded(
  db: CandidateDb,
  candidateQuestionId: string,
  contentFingerprint: string,
  previousFingerprint: string | null,
): Promise<DuplicateGroupResult> {
  // fingerprint가 실제로 바뀐 경우에만 stale membership 정리를 수행한다.
  // 신규 생성(previousFingerprint=null)이거나 fingerprint가 동일하면 불필요한 변경을 하지 않는다.
  if (
    previousFingerprint !== null &&
    previousFingerprint !== contentFingerprint
  ) {
    await removeStaleMembership(db, candidateQuestionId, previousFingerprint);
  }

  const group = await db.candidateDuplicateGroup.findUnique({
    where: { fingerprint: contentFingerprint },
  });
  if (group) {
    await db.candidateDuplicateMember.createMany({
      data: [{ groupId: group.id, candidateQuestionId }],
      skipDuplicates: true,
    });
    return { isDuplicate: true, groupId: group.id };
  }

  const existing = await db.candidateQuestion.findFirst({
    where: { contentFingerprint, id: { not: candidateQuestionId } },
  });
  if (!existing) {
    return { isDuplicate: false, groupId: null };
  }

  const createdGroup = await db.candidateDuplicateGroup.create({
    data: {
      fingerprint: contentFingerprint,
      isResolved: false,
      masterCandidateId: null,
      members: {
        create: [
          { candidateQuestionId: existing.id },
          { candidateQuestionId },
        ],
      },
    },
  });
  return { isDuplicate: true, groupId: createdGroup.id };
}
