/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiUser } from "@/lib/api/auth";
import type { FileStorage } from "@/lib/storage/types";
import { createFakeDb } from "./helpers/fakePrisma";

const dbHolder = vi.hoisted(() => ({ current: null as any }));

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        const current = dbHolder.current;
        if (!current) throw new Error("fake prisma not initialized");
        return current.prisma[prop];
      },
    },
  ),
}));

vi.mock("@/lib/storage", () => ({
  getFileStorage: vi.fn(),
}));

import { getFileStorage } from "@/lib/storage";
import { deletePostAttachment, uploadPostAttachments } from "@/lib/attachments/service";

const USER_A: ApiUser = { id: "user-1", email: "a@test.com", role: "USER", status: "ACTIVE" };
const USER_B: ApiUser = { id: "user-2", email: "b@test.com", role: "USER", status: "ACTIVE" };

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf,
  0xd3,
]);

function makePngFile(name = "photo.png"): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

function makePdfFile(name = "doc.pdf"): File {
  return new File([PDF_BYTES], name, { type: "application/pdf" });
}

type StorageMock = {
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let db: ReturnType<typeof createFakeDb>;
let storage: StorageMock;

function postRow(overrides: Record<string, any> = {}): Record<string, any> {
  const now = new Date("2026-08-09T00:00:00.000Z");
  return {
    id: "post-1",
    type: "HIRE",
    title: "첨부 게시글",
    content: "본문",
    status: "PUBLISHED",
    viewCount: 0,
    authorId: "user-1",
    companyId: null,
    regionId: null,
    vehicleTypeId: null,
    tonnageId: null,
    payType: null,
    payAmount: null,
    workType: null,
    conditions: null,
    publishedAt: now,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    author: { id: "user-1", name: "홍길동", nickname: null },
    region: null,
    vehicleType: null,
    tonnage: null,
    attachments: [],
    ...overrides,
  };
}

function attachmentRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: "att-1",
    postId: "post-1",
    storageKey: "post-1/key.png",
    originalName: "a.png",
    mimeType: "image/png",
    fileSize: 16,
    mediaType: "IMAGE",
    sortOrder: 0,
    isRepresentative: false,
    deletedAt: null,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  db = createFakeDb();
  dbHolder.current = db;
  vi.clearAllMocks();
  storage = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(getFileStorage).mockReset();
  vi.mocked(getFileStorage).mockReturnValue(storage as unknown as FileStorage);
});

describe("uploadPostAttachments", () => {
  it("존재하지 않는 게시글이면 404를 반환한다", async () => {
    await expect(uploadPostAttachments(USER_A, "nope", [makePngFile()])).rejects.toMatchObject({
      status: 404,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("작성자가 아니면 403을 반환한다", async () => {
    db.seed.addPost(postRow({ authorId: "user-1" }));

    await expect(uploadPostAttachments(USER_B, "post-1", [makePngFile()])).rejects.toMatchObject({
      status: 403,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("첨부 개수 초과 시 422를 반환한다", async () => {
    db.seed.addPost(postRow());
    for (let index = 0; index < 10; index += 1) {
      db.seed.addAttachment(
        attachmentRow({ id: `att-${index}`, storageKey: `post-1/key-${index}.png` }),
      );
    }

    await expect(uploadPostAttachments(USER_A, "post-1", [makePngFile()])).rejects.toMatchObject({
      status: 422,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("PNG 업로드 성공 시 저장하고 첫 이미지를 대표로 지정한다", async () => {
    db.seed.addPost(postRow());

    const result = await uploadPostAttachments(USER_A, "post-1", [makePngFile("photo.png")]);

    expect(storage.put).toHaveBeenCalledTimes(1);
    const key = storage.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^post-1\/[a-f0-9-]+\.png$/);
    expect(storage.put).toHaveBeenCalledWith(key, expect.any(Buffer), "image/png");

    expect(db.store.attachments).toHaveLength(1);
    expect(db.store.attachments[0].storageKey).toBe(key);
    expect(db.store.attachments[0].originalName).toBe("photo.png");
    expect(db.store.attachments[0].mediaType).toBe("IMAGE");

    expect(result).toHaveLength(1);
    expect(result[0].isRepresentative).toBe(true);
    expect(result[0]).not.toHaveProperty("storageKey");
  });

  it("대표 이미지가 이미 있으면 새 이미지는 대표가 아니다", async () => {
    db.seed.addPost(postRow());
    db.seed.addAttachment(attachmentRow({ isRepresentative: true }));

    const result = await uploadPostAttachments(USER_A, "post-1", [makePngFile("photo.png")]);

    expect(result).toHaveLength(2);
    const uploaded = result.find((item) => item.originalName === "photo.png");
    expect(uploaded?.isRepresentative).toBe(false);
  });

  it("PDF는 문서로 저장되고 대표 이미지가 되지 않는다", async () => {
    db.seed.addPost(postRow());

    const result = await uploadPostAttachments(USER_A, "post-1", [makePdfFile()]);

    expect(result[0].mediaType).toBe("DOCUMENT");
    expect(result[0].isRepresentative).toBe(false);
  });

  it("storage.put 실패 시 저장된 파일을 정리하고 오류를 전파한다", async () => {
    db.seed.addPost(postRow());
    storage.put
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk full"));

    await expect(
      uploadPostAttachments(USER_A, "post-1", [makePngFile("a.png"), makePngFile("b.png")]),
    ).rejects.toThrow("disk full");

    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(db.store.attachments).toHaveLength(0);
  });
});

describe("deletePostAttachment", () => {
  it("작성자만 삭제할 수 있다", async () => {
    db.seed.addPost(postRow());
    db.seed.addAttachment(attachmentRow({ id: "att-1" }));

    await expect(deletePostAttachment(USER_B, "post-1", "att-1")).rejects.toMatchObject({
      status: 403,
    });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(db.store.attachments).toHaveLength(1);
  });

  it("대표 이미지 삭제 시 다음 이미지로 승계한다", async () => {
    db.seed.addPost(postRow());
    db.seed.addAttachment(
      attachmentRow({ id: "att-1", storageKey: "post-1/rep.png", sortOrder: 0, isRepresentative: true }),
    );
    db.seed.addAttachment(
      attachmentRow({ id: "att-2", storageKey: "post-1/next.png", sortOrder: 1, isRepresentative: false }),
    );

    const result = await deletePostAttachment(USER_A, "post-1", "att-1");

    expect(result).toEqual({ id: "att-1" });
    expect(storage.delete).toHaveBeenCalledWith("post-1/rep.png");
    expect(db.store.attachments).toHaveLength(1);
    expect(db.store.attachments[0].id).toBe("att-2");
    expect(db.store.attachments[0].isRepresentative).toBe(true);
  });

  it("다른 게시글의 첨부파일은 삭제할 수 없다 (404)", async () => {
    db.seed.addPost(postRow());
    db.seed.addPost(postRow({ id: "post-2", authorId: "user-2" }));
    db.seed.addAttachment(attachmentRow({ id: "att-other", postId: "post-2" }));

    await expect(deletePostAttachment(USER_A, "post-1", "att-other")).rejects.toMatchObject({
      status: 404,
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("없는 첨부파일은 404를 반환한다", async () => {
    db.seed.addPost(postRow());

    await expect(deletePostAttachment(USER_A, "post-1", "nope")).rejects.toMatchObject({
      status: 404,
    });
  });
});
