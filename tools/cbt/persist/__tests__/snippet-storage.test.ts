import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeSnippetId,
  createSnippetStorage,
  snippetFileName,
} from "../snippet-storage";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "cbt-snippet-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("computeSnippetId", () => {
  it("같은 content는 같은 id를 만든다", () => {
    const content = "<div>문제</div>";
    expect(computeSnippetId(content)).toBe(computeSnippetId(content));
  });

  it("다른 content는 다른 id를 만든다", () => {
    expect(computeSnippetId("<div>문제</div>")).not.toBe(
      computeSnippetId("<div>보기</div>"),
    );
  });

  it("sha256 hex 64자리", () => {
    expect(computeSnippetId("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("createSnippetStorage", () => {
  it("save는 content hash id를 반환하고 파일을 쓴다", async () => {
    const storage = createSnippetStorage(dir);
    const content = "<div>문제</div>";
    const { id, content: saved } = await storage.save(content);
    expect(saved).toBe(content);
    expect(id).toBe(computeSnippetId(content));
    expect(await fs.readFile(path.join(dir, snippetFileName(id)), "utf8")).toBe(
      content,
    );
  });

  it("같은 content를 두 번 저장해도 id 동일, 파일은 1개만 생긴다", async () => {
    const storage = createSnippetStorage(dir);
    const content = "<div>문제</div>";
    const first = await storage.save(content);
    const second = await storage.save(content);
    expect(second.id).toBe(first.id);
    expect(await fs.readdir(dir)).toEqual([snippetFileName(first.id)]);
  });

  it("read는 저장된 원문을 반환하고, 없는 id는 null", async () => {
    const storage = createSnippetStorage(dir);
    const content = "<div>문제</div>";
    const { id } = await storage.save(content);
    expect(await storage.read(id)).toBe(content);
    expect(await storage.read("missing-id")).toBeNull();
  });

  it("exists는 존재 여부를 반환한다", async () => {
    const storage = createSnippetStorage(dir);
    const { id } = await storage.save("<div>x</div>");
    expect(await storage.exists(id)).toBe(true);
    expect(await storage.exists("missing-id")).toBe(false);
  });
});
