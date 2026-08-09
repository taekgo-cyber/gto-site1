import { MAX_ATTACHMENTS_PER_POST, MAX_FILE_SIZE } from "@/lib/attachments/validation";

export { MAX_ATTACHMENTS_PER_POST, MAX_FILE_SIZE };

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
] as const;

export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / 1024 / 1024;
