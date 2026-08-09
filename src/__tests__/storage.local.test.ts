import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskFileStorage } from "@/lib/storage/local";

let tempDir: string;
let storage: LocalDiskFileStorage;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
  storage = new LocalDiskFileStorage(tempDir);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("LocalDiskFileStorage", () => {
  it("put/get/delete 라운드트립이 동작한다", async () => {
    const key = "post123/abc-123.png";
    const data = Buffer.from("fake-image-bytes");

    await storage.put(key, data, "image/png");

    const stored = await storage.get(key);
    expect(stored.toString()).toBe("fake-image-bytes");

    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("path traversal 키를 거부한다", async () => {
    await expect(storage.put("../escape.png", Buffer.from("x"), "image/png")).rejects.toThrow(
      "유효하지 않은 storage key",
    );
    await expect(
      storage.put("post1/../../../secret.png", Buffer.from("x"), "image/png"),
    ).rejects.toThrow();
    await expect(storage.get("post1/../../../secret.png")).rejects.toThrow();
    await expect(storage.delete("post1/../../../secret.png")).rejects.toThrow();
  });

  it("절대 경로 키를 거부한다", async () => {
    await expect(storage.put("/etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });

  it("파일 확장자가 없는 키를 거부한다", async () => {
    await expect(storage.put("post1/abc", Buffer.from("x"), "image/png")).rejects.toThrow();
  });
});
