import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileStorage } from "./types";

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

export class LocalDiskFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolvePath(key: string): string {
    if (!SAFE_KEY_RE.test(key)) {
      throw new Error("유효하지 않은 storage key입니다.");
    }
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }
}
