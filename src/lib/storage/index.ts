import path from "node:path";
import type { FileStorage } from "./types";
import { LocalDiskFileStorage } from "./local";

export type StorageProvider = "local";

export function getFileStorage(): FileStorage {
  const provider = (process.env.STORAGE_PROVIDER ?? "local") as StorageProvider;

  switch (provider) {
    case "local":
      return new LocalDiskFileStorage(
        process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"),
      );
    default:
      throw new Error(`지원하지 않는 storage provider입니다: ${provider}`);
  }
}
