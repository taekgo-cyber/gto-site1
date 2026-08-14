// STEP 6 — rawHtmlSnippet content-addressable 저장소 (Session 10-1 STEP 6 §26).
// snippet id = sha256(content). 동일 content는 동일 id → 중복 파일을 만들지 않는다.
// DB에는 파일 경로가 아니라 snippet id(rawHtmlSnippetId)만 저장한다.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type SnippetStorage = {
  /** content 저장. 이미 같은 content가 있으면 기존 파일을 재사용한다 */
  save(content: string): Promise<{ id: string; content: string }>;
  /** id로 원문 읽기. 없으면 null */
  read(id: string): Promise<string | null>;
  /** id 존재 여부 */
  exists(id: string): Promise<boolean>;
};

export function computeSnippetId(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function snippetFileName(id: string): string {
  return `${id}.html`;
}

export function createSnippetStorage(dir: string): SnippetStorage {
  return {
    async save(content) {
      const id = computeSnippetId(content);
      const filePath = path.join(dir, snippetFileName(id));
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, "utf8");
      }
      return { id, content };
    },
    async read(id) {
      try {
        return await fs.readFile(path.join(dir, snippetFileName(id)), "utf8");
      } catch {
        return null;
      }
    },
    async exists(id) {
      try {
        await fs.access(path.join(dir, snippetFileName(id)));
        return true;
      } catch {
        return false;
      }
    },
  };
}
