import { describe, expect, it } from "vitest";
import { buildAttachmentUrl } from "@/lib/attachments/url";
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENTS_PER_POST,
  MAX_FILE_SIZE_MB,
} from "@/lib/lease/constants";
import {
  CREATE_STATUS_OPTIONS,
  EDIT_STATUS_OPTIONS,
  PAY_TYPE_OPTIONS,
  WORK_TYPE_OPTIONS,
} from "@/lib/lease/options";

describe("buildAttachmentUrl", () => {
  it("게시글/첨부 ID를 인코딩해 파일 URL을 만든다", () => {
    expect(buildAttachmentUrl("post-1", "att-2")).toBe(
      "/api/posts/post-1/attachments/att-2/file",
    );
  });

  it("특수 문자가 포함된 ID는 인코딩한다", () => {
    expect(buildAttachmentUrl("a/b", "c d")).toBe(
      "/api/posts/a%2Fb/attachments/c%20d/file",
    );
  });
});

describe("첨부파일 UI 상수", () => {
  it("허용 확장자 목록에 이미지와 PDF가 포함된다", () => {
    expect(ALLOWED_ATTACHMENT_EXTENSIONS).toEqual(
      expect.arrayContaining([".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"]),
    );
  });

  it("파일당 10MB, 게시글당 10개 제한을 노출한다", () => {
    expect(MAX_FILE_SIZE_MB).toBe(10);
    expect(MAX_ATTACHMENTS_PER_POST).toBe(10);
  });
});

describe("옵션 라벨", () => {
  it("급여 유형 옵션의 라벨이 올바르다", () => {
    expect(PAY_TYPE_OPTIONS.find((option) => option.value === "MONTHLY")?.label).toBe("월급");
    expect(PAY_TYPE_OPTIONS.find((option) => option.value === "FREIGHT")?.label).toBe("운임");
    expect(PAY_TYPE_OPTIONS.find((option) => option.value === "NEGOTIABLE")?.label).toBe("협의");
  });

  it("근무 형태 옵션의 라벨이 올바르다", () => {
    expect(WORK_TYPE_OPTIONS.find((option) => option.value === "FULL_TIME")?.label).toBe(
      "정규직",
    );
    expect(WORK_TYPE_OPTIONS.find((option) => option.value === "DAILY")?.label).toBe("일용직");
  });

  it("작성 상태 옵션은 게시/임시저장만 포함한다", () => {
    expect(CREATE_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      "PUBLISHED",
      "DRAFT",
    ]);
  });

  it("수정 상태 옵션은 마감을 포함한다", () => {
    expect(EDIT_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      "PUBLISHED",
      "DRAFT",
      "CLOSED",
    ]);
  });
});
