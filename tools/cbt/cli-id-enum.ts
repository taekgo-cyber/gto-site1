// STEP 10-3 — NEWBT 문제 ID 열거 CLI.
//
//   npm run cbt:id-enum -- --seed=92573,92628
//   npm run cbt:id-enum -- --seed=92573 --out=data/cbt/newbt-ids.txt
//
// 직렬(시험지)의 1번 문제를 seed로 주면 해당 직렬 전체 문제 id를 순회한다.
// - seed id 1개 = 그 id가 속한 직렬 1개 (예: 92573 → 제1회 80문항,
//   92628 → 제2회 80문항). 전체 160문항을 모으려면 두 직렬의 seed를 모두 준다.
// - --out에 줄 단위로 저장한다 (batch-ingest의 --ids-file로 재사용).
// - 순회 중 API 실패 시 중단하며, 그때까지 모은 id는 출력하지 않는다.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  findNewbtSource,
  enumerateNewbtSerial,
  createEnumLimiter,
} from "./collector/newbt-id-enum";
import { parseBatchArgs, parseIds } from "./batch/args";

async function main(): Promise<void> {
  const args = parseBatchArgs(process.argv.slice(2));
  const source = findNewbtSource();

  const seedFlag = args.values.get("seed");
  const seedFile = args.values.get("seed-file");
  const seeds =
    seedFile != null
      ? (await fs.readFile(seedFile, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      : parseIds(seedFlag);
  if (seeds.length === 0) {
    throw new Error("--seed=id1,id2 또는 --seed-file=path 가 필요합니다.");
  }

  const out = args.values.get("out");
  const limiter = createEnumLimiter();

  const collected: number[] = [];
  const seen = new Set<number>();
  for (const seed of seeds) {
    const result = await enumerateNewbtSerial(source, Number(seed), { limiter });
    if (result.kind === "failed") {
      throw new Error(`seed ${seed} 직렬 열거 실패: ${result.error}`);
    }
    const before = collected.length;
    for (const id of result.ids) {
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(id);
      }
    }
    console.log(`seed=${seed} 직렬 ${result.ids.length}문항 (신규 ${collected.length - before})`);
  }

  if (out != null) {
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, collected.join("\n") + "\n", "utf8");
  }
  console.log(`열거 완료: 총 ${collected.length}문항 ${out ? `→ ${out}` : ""}`);
  console.log(collected.join(","));
}

main().catch((err) => {
  console.error("id-enum 실패:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
