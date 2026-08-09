import type {
  AttachmentMediaType,
  LeasePostStatus,
  LeasePostType,
} from "@/generated/prisma/enums";
import { formatPayAmount } from "@/lib/jobs/labels";

const LEASE_POST_TYPE_LABELS: Record<LeasePostType, string> = {
  HIRE: "지입 구인",
  SEEK: "지입 구직",
};

const LEASE_POST_STATUS_LABELS: Record<LeasePostStatus, string> = {
  DRAFT: "임시저장",
  PUBLISHED: "게시됨",
  CLOSED: "마감",
  HIDDEN: "숨김",
};

const MEDIA_TYPE_LABELS: Record<AttachmentMediaType, string> = {
  IMAGE: "이미지",
  DOCUMENT: "문서",
};

export function leasePostTypeLabel(type: LeasePostType): string {
  return LEASE_POST_TYPE_LABELS[type];
}

export function leasePostStatusLabel(status: LeasePostStatus): string {
  return LEASE_POST_STATUS_LABELS[status];
}

export function mediaTypeLabel(mediaType: AttachmentMediaType): string {
  return MEDIA_TYPE_LABELS[mediaType];
}

export { formatPayAmount };
