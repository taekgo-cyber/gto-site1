import { randomUUID } from "node:crypto";
import type { AttachmentMediaType } from "@/generated/prisma/enums";
import { fileTooLarge, validationError } from "@/lib/api/errors";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_POST = 10;
export const MAX_ORIGINAL_NAME_LENGTH = 200;

type AllowedSpec = {
  ext: string;
  mimeType: string;
  mediaType: AttachmentMediaType;
};

const IMAGE_SPECS: AllowedSpec[] = [
  { ext: "jpg", mimeType: "image/jpeg", mediaType: "IMAGE" },
  { ext: "png", mimeType: "image/png", mediaType: "IMAGE" },
  { ext: "gif", mimeType: "image/gif", mediaType: "IMAGE" },
  { ext: "webp", mimeType: "image/webp", mediaType: "IMAGE" },
];

const DOCUMENT_SPECS: AllowedSpec[] = [
  { ext: "pdf", mimeType: "application/pdf", mediaType: "DOCUMENT" },
];

const ALLOWED_SPECS = [...IMAGE_SPECS, ...DOCUMENT_SPECS];

const MAGIC_BYTES: Array<{ ext: string; match: (bytes: Uint8Array) => boolean }> = [
  {
    ext: "jpg",
    match: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    match: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: "gif",
    match: (b) =>
      b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    ext: "webp",
    match: (b) => {
      if (b.length < 12) return false;
      const riff = [0x52, 0x49, 0x46, 0x46];
      const webp = [0x57, 0x45, 0x42, 0x50];
      for (let i = 0; i < 4; i += 1) {
        if (b[i] !== riff[i] || b[i + 8] !== webp[i]) return false;
      }
      return true;
    },
  },
  {
    ext: "pdf",
    match: (b) =>
      b.length >= 5 &&
      b[0] === 0x25 &&
      b[1] === 0x50 &&
      b[2] === 0x44 &&
      b[3] === 0x46 &&
      b[4] === 0x2d,
  },
];

export type ValidatedFile = {
  mediaType: AttachmentMediaType;
  mimeType: string;
  ext: string;
  originalName: string;
  fileSize: number;
};

function detectExt(bytes: Uint8Array): string | null {
  const match = MAGIC_BYTES.find((signature) => signature.match(bytes));
  return match ? match.ext : null;
}

function sanitizeOriginalName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .trim()
    .slice(0, MAX_ORIGINAL_NAME_LENGTH);
  return cleaned || "file";
}

export async function validateUpload(file: File): Promise<ValidatedFile> {
  if (file.size === 0) {
    throw validationError({ file: "빈 파일은 업로드할 수 없습니다." });
  }
  if (file.size > MAX_FILE_SIZE) {
    throw fileTooLarge(`파일 크기는 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB입니다.`);
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detectedExt = detectExt(header);
  if (!detectedExt) {
    throw validationError({ file: "지원하지 않는 파일 형식입니다. (이미지 또는 PDF만 허용)" });
  }

  const spec = ALLOWED_SPECS.find((allowed) => allowed.ext === detectedExt);
  if (!spec) {
    throw validationError({ file: "지원하지 않는 파일 형식입니다." });
  }

  return {
    mediaType: spec.mediaType,
    mimeType: spec.mimeType,
    ext: spec.ext,
    originalName: sanitizeOriginalName(file.name),
    fileSize: file.size,
  };
}

export function createStorageKey(postId: string, ext: string): string {
  return `${postId}/${randomUUID()}.${ext}`;
}
