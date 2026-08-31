import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export function valueAfter(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

export function assertKnownPairs(argv: string[], known: ReadonlySet<string>): void {
  if (argv.length % 2 !== 0) throw new Error("cbt_source_cli_argument_invalid");
  for (let index = 0; index < argv.length; index += 2) {
    if (!known.has(argv[index])) throw new Error(`cbt_source_cli_argument_unknown:${argv[index]}`);
  }
}

export async function expectedMigrationNames(): Promise<string[]> {
  const root = path.resolve("prisma/migrations");
  const entries = await readdir(root, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if ((await stat(path.join(root, entry.name, "migration.sql"))).isFile()) names.push(entry.name);
    } catch {
      // Ignore non-migration helper directories.
    }
  }
  return names.sort((left, right) => left.localeCompare(right, "en"));
}
