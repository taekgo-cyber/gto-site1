import type { CbtOption } from "./types";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;

export function parseCbtOptions(json: unknown): CbtOption[] {
  if (!Array.isArray(json)) return [];

  const options: CbtOption[] = [];
  const seenIds = new Set<number>();

  for (const item of json) {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const id = record.id;
    const text = record.text;

    if (typeof id !== "number" || !Number.isInteger(id)) return [];
    if (typeof text !== "string" || text.trim() === "") return [];
    if (seenIds.has(id)) return [];

    seenIds.add(id);
    options.push({ id, text: text.trim() });
  }

  return options;
}

export function isValidCbtOptions(json: unknown): boolean {
  const options = parseCbtOptions(json);
  return options.length >= MIN_OPTIONS && options.length <= MAX_OPTIONS;
}
