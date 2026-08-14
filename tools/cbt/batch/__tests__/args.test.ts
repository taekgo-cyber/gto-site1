import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseBatchArgs,
  parseIds,
  parseLimit,
  readIdsFile,
} from "../args";

describe("parseBatchArgs", () => {
  it("--key=value → values / --flag → flags / 나머지 → positionals", () => {
    const parsed = parseBatchArgs([
      "--source=NEWBT-HWMUL",
      "--dry-run",
      "gen",
    ]);
    expect(parsed.values.get("source")).toBe("NEWBT-HWMUL");
    expect(parsed.flags.has("dry-run")).toBe(true);
    expect(parsed.positionals).toEqual(["gen"]);
  });

  it("값 없는 key는 flags로 분류된다", () => {
    const parsed = parseBatchArgs(["--all"]);
    expect(parsed.flags.has("all")).toBe(true);
    expect(parsed.values.size).toBe(0);
  });
});

describe("parseLimit", () => {
  it("10 → 10", () => {
    expect(parseLimit("10")).toBe(10);
  });

  it("0 → throw", () => {
    expect(() => parseLimit("0")).toThrow("--limit은 양의 정수여야 합니다");
  });

  it("-3 → throw", () => {
    expect(() => parseLimit("-3")).toThrow("--limit은 양의 정수여야 합니다");
  });

  it("abc → throw", () => {
    expect(() => parseLimit("abc")).toThrow("--limit은 양의 정수여야 합니다");
  });

  it("undefined → null", () => {
    expect(parseLimit(undefined)).toBeNull();
  });
});

describe("parseIds", () => {
  it("CSV를 파싱하고 trim한다", () => {
    expect(parseIds(" 92628 , 92631 ")).toEqual(["92628", "92631"]);
  });

  it("빈 문자열 항목을 제거한다", () => {
    expect(parseIds("a,,b")).toEqual(["a", "b"]);
  });

  it("중복을 제거하고 순서를 유지한다", () => {
    expect(parseIds("a,b,a,c")).toEqual(["a", "b", "c"]);
  });

  it("undefined → 빈 배열", () => {
    expect(parseIds(undefined)).toEqual([]);
  });
});

describe("readIdsFile", () => {
  it("빈 줄과 # 주석을 제거하고 ID를 읽는다", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ids-file-"));
    const file = path.join(dir, "ids.txt");
    await writeFile(file, "92628\n\n# 주석입니다\n92631\n  92633\n", "utf8");
    try {
      expect(await readIdsFile(file)).toEqual(["92628", "92631", "92633"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("없는 파일 → throw", async () => {
    await expect(readIdsFile("missing-ids.txt")).rejects.toThrow(
      "ids 파일을 찾을 수 없습니다",
    );
  });
});
