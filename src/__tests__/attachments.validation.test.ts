import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  MAX_ATTACHMENTS_PER_POST,
  MAX_FILE_SIZE,
  createStorageKey,
  validateUpload,
} from "@/lib/attachments/validation";

function makeFile(
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  type = "application/octet-stream",
): File {
  return new File([bytes], name, { type });
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf,
  0xd3,
]);

const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);

const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x20,
]);

const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);

describe("validateUpload", () => {
  it("허용된 이미지(PNG)를 통과시킨다", async () => {
    const result = await validateUpload(makeFile("photo.png", PNG_BYTES));

    expect(result.mediaType).toBe("IMAGE");
    expect(result.mimeType).toBe("image/png");
    expect(result.ext).toBe("png");
    expect(result.originalName).toBe("photo.png");
  });

  it("JPEG/GIF/WebP/PDF도 통과시킨다", async () => {
    expect((await validateUpload(makeFile("a.jpg", JPEG_BYTES))).ext).toBe("jpg");
    expect((await validateUpload(makeFile("a.gif", GIF_BYTES))).ext).toBe("gif");
    expect((await validateUpload(makeFile("a.webp", WEBP_BYTES))).ext).toBe("webp");
    expect((await validateUpload(makeFile("a.pdf", PDF_BYTES))).ext).toBe("pdf");
  });

  it("허용되지 않은 형식(EXE)을 차단한다", async () => {
    await expect(validateUpload(makeFile("malware.exe", EXE_BYTES))).rejects.toThrow(
      ApiError,
    );
  });

  it("확장자 위조(실제는 EXE인데 .png)를 차단한다", async () => {
    await expect(
      validateUpload(makeFile("fake.png", EXE_BYTES, "image/png")),
    ).rejects.toMatchObject({
      status: 422,
      fields: { file: expect.stringContaining("지원하지 않는 파일 형식") },
    });
  });

  it("허용된 MIME 유형이 아니어도 실제 형식이면 통과시킨다", async () => {
    const result = await validateUpload(makeFile("photo.png", PNG_BYTES, "application/zip"));
    expect(result.mimeType).toBe("image/png");
  });

  it("파일 크기 초과를 차단한다", async () => {
    const big = new Uint8Array(MAX_FILE_SIZE + 1).fill(0x41);

    await expect(validateUpload(makeFile("big.png", big))).rejects.toThrow("최대");
  });

  it("빈 파일을 차단한다", async () => {
    await expect(validateUpload(makeFile("empty.png", new Uint8Array(0)))).rejects.toMatchObject({
      status: 422,
      fields: { file: expect.stringContaining("빈 파일") },
    });
  });

  it("파일명에서 경로/제어 문자를 제거한다", async () => {
    const result = await validateUpload(makeFile("..\\..\\evil.png", PNG_BYTES));
    expect(result.originalName).not.toContain("\\");
    expect(result.originalName).not.toContain("/");
  });
});

describe("createStorageKey", () => {
  it("서버가 생성한 키를 반환한다 (사용자 파일명 미포함)", () => {
    const key = createStorageKey("post-1", "png");

    expect(key).toMatch(/^post-1\/[a-f0-9-]+\.png$/);
  });

  it("같은 게시글에 서로 다른 키를 생성한다", () => {
    const key1 = createStorageKey("post-1", "png");
    const key2 = createStorageKey("post-1", "png");
    expect(key1).not.toBe(key2);
  });
});

describe("limits", () => {
  it("첨부 개수/크기 상수가 정의되어 있다", () => {
    expect(MAX_ATTACHMENTS_PER_POST).toBe(10);
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});
