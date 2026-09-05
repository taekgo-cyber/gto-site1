import path from "node:path";
import type { FileStorage } from "./types";
import { LocalDiskFileStorage } from "./local";

export type StorageProvider = "local";

export function resolveUploadDirectory(
  env: { UPLOAD_DIR?: string },
  cwd = process.cwd(),
): string {
  const configured = env.UPLOAD_DIR?.trim();
  return configured || path.join(cwd, "uploads");
}

export function getFileStorage(): FileStorage {
  const provider = (process.env.STORAGE_PROVIDER ?? "local") as StorageProvider;

  switch (provider) {
    case "local":
      return new LocalDiskFileStorage(
        resolveUploadDirectory({ UPLOAD_DIR: process.env.UPLOAD_DIR }),
      );
    default:
      throw new Error(`지원하지 않는 storage provider입니다: ${provider}`);
  }
}
