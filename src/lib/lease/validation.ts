import {
  MAX_ATTACHMENTS_PER_POST,
  MAX_FILE_SIZE,
  ALLOWED_ATTACHMENT_EXTENSIONS,
} from "./constants";
import type { LeasePostStatus } from "@/generated/prisma/enums";

export const TITLE_MAX = 100;
export const CONTENT_MAX = 5000;
export const PAY_AMOUNT_MAX = 1_000_000_000;

export type LeaseFormValues = {
  type: "HIRE" | "SEEK" | "";
  title: string;
  content: string;
  status: LeasePostStatus;
  regionId: string;
  vehicleTypeId: string;
  tonnageId: string;
  payType: string;
  payAmount: string;
  workType: string;
  conditions: string;
};

export type LeaseFormFieldErrors = Record<string, string>;

/**
 * 클라이언트 UX용 검증. 최종 검증은 Session 5 서버 API가 수행한다.
 */
export function validateLeaseForm(values: LeaseFormValues): LeaseFormFieldErrors {
  const errors: LeaseFormFieldErrors = {};

  if (values.type !== "HIRE" && values.type !== "SEEK") {
    errors.type = "게시글 유형을 선택해 주세요.";
  }

  const title = values.title.trim();
  if (!title) {
    errors.title = "제목을 입력해 주세요.";
  } else if (title.length > TITLE_MAX) {
    errors.title = `제목은 ${TITLE_MAX}자 이하여야 합니다.`;
  }

  const content = values.content.trim();
  if (!content) {
    errors.content = "내용을 입력해 주세요.";
  } else if (content.length > CONTENT_MAX) {
    errors.content = `내용은 ${CONTENT_MAX}자 이하여야 합니다.`;
  }

  if (values.payType && values.payType !== "NEGOTIABLE" && values.payAmount.trim() !== "") {
    const amount = Number(values.payAmount);
    if (!Number.isInteger(amount)) {
      errors.payAmount = "급여/매출 금액은 정수여야 합니다.";
    } else if (amount < 0 || amount > PAY_AMOUNT_MAX) {
      errors.payAmount = `금액은 0 ~ ${PAY_AMOUNT_MAX.toLocaleString("ko-KR")} 범위여야 합니다.`;
    }
  }

  return errors;
}

export type AttachmentFileIssue = {
  index: number;
  message: string;
};

export function validateAttachmentFiles(files: File[]): AttachmentFileIssue[] {
  const issues: AttachmentFileIssue[] = [];

  if (files.length > MAX_ATTACHMENTS_PER_POST) {
    return [
      {
        index: -1,
        message: `게시글당 첨부파일은 최대 ${MAX_ATTACHMENTS_PER_POST}개까지 허용됩니다.`,
      },
    ];
  }

  files.forEach((file, index) => {
    if (file.size === 0) {
      issues.push({ index, message: `${file.name} — 빈 파일은 업로드할 수 없습니다.` });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      issues.push({
        index,
        message: `${file.name} — 파일 크기는 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB입니다.`,
      });
      return;
    }
    const ext = file.name.toLowerCase().split(".").pop();
    const allowed = ALLOWED_ATTACHMENT_EXTENSIONS.some(
      (candidate) => candidate === `.${ext}`,
    );
    if (!allowed) {
      issues.push({
        index,
        message: `${file.name} — 지원하지 않는 파일 형식입니다. (이미지 또는 PDF만 허용)`,
      });
    }
  });

  return issues;
}
