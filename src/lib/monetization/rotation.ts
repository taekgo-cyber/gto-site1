import { ADVERTISEMENT_ROTATION_WINDOW_MINUTES } from "./policy";

export type RotationCandidate = { id: string };

export function getRotationWindowKey(
  now: Date,
  windowMinutes = ADVERTISEMENT_ROTATION_WINDOW_MINUTES,
): number {
  if (Number.isNaN(now.getTime()) || !Number.isInteger(windowMinutes) || windowMinutes <= 0) {
    throw new Error("ADVERTISEMENT_ROTATION_WINDOW_INVALID");
  }
  return Math.floor(now.getTime() / (windowMinutes * 60_000));
}

function stableGroupOffset(groupKey: string): number {
  let hash = 0;
  for (let index = 0; index < groupKey.length; index += 1) {
    hash = (hash * 31 + groupKey.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Stable round-robin selection. Across a full candidate cycle every campaign
 * receives the same number of selections and first positions (where possible).
 */
export function rotateAdvertisementCandidates<T extends RotationCandidate>(input: {
  candidates: readonly T[];
  visibleSlots: number;
  windowKey: number;
  groupKey?: string;
}): T[] {
  const { candidates, visibleSlots, windowKey, groupKey = "" } = input;
  if (!Number.isInteger(visibleSlots) || visibleSlots < 0 || !Number.isInteger(windowKey)) {
    throw new Error("ADVERTISEMENT_ROTATION_INPUT_INVALID");
  }
  if (visibleSlots === 0 || candidates.length === 0) return [];

  const ordered = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  const start = ((windowKey + stableGroupOffset(groupKey)) % ordered.length + ordered.length) % ordered.length;
  const count = Math.min(visibleSlots, ordered.length);
  return Array.from({ length: count }, (_, index) => ordered[(start + index) % ordered.length]);
}
