// STEP 9 — Batch Runner CLI 인자 파서 (STEP 9 BUILD HANDOFF §2.2).
// cli-step8.ts의 parseArgs 스타일을 일반화한다. cli-step8.ts 자체는 수정하지 않는다.
import { readFile } from "node:fs/promises";

export type ParsedArgs = {
  /** --flag 형태의 boolean 플래그 */
  flags: Set<string>;
  /** --key=value 형태의 값 */
  values: Map<string, string>;
  /** 플래그가 아닌 위치 인자 */
  positionals: string[];
};

/** --key=value → values / --flag → flags / 나머지 → positionals */
export function parseBatchArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (const token of argv) {
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        values.set(body.slice(0, eq), body.slice(eq + 1));
      } else {
        flags.add(body);
      }
    } else {
      positionals.push(token);
    }
  }

  return { flags, values, positionals };
}

/** --limit 파싱: undefined → null, 양의 정수 → 숫자, 그 외 → throw */
export function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`--limit은 양의 정수여야 합니다: ${raw}`);
  }
  const n = Number.parseInt(raw, 10);
  if (n <= 0) {
    throw new Error(`--limit은 양의 정수여야 합니다: ${raw}`);
  }
  return n;
}

/** --ids CSV 파싱: split → trim → 빈 문자열 제거 → 중복 제거 (순서 유지) */
export function parseIds(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** --ids-file: 줄 단위, trim, 빈 줄과 # 주석 무시 */
export async function readIdsFile(filePath: string): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`ids 파일을 찾을 수 없습니다: ${filePath}`);
  }
  const ids: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("#")) continue;
    ids.push(trimmed);
  }
  return ids;
}
