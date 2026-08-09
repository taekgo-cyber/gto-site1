import { beforeEach, describe, expect, it, vi } from "vitest";
import * as postDal from "@/lib/posts/dal";

vi.mock("@/lib/posts/dal", () => ({
  createPostRow: vi.fn(),
  findPost: vi.fn(),
  incrementPostView: vi.fn(),
  softDeletePostAttachments: vi.fn(),
  softDeletePostRow: vi.fn(),
  updatePostRow: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    region: { findUnique: vi.fn() },
    vehicleType: { findUnique: vi.fn() },
    tonnage: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import type { PostRecord } from "@/lib/posts/dal";
import { createPost, deletePost, getPostDetail, updatePost } from "@/lib/posts/service";
import type { ApiUser } from "@/lib/api/auth";

const USER_A: ApiUser = { id: "user-1", email: "a@test.com", role: "USER", status: "ACTIVE" };
const USER_B: ApiUser = { id: "user-2", email: "b@test.com", role: "USER", status: "ACTIVE" };

function makePost(overrides: Partial<PostRecord> = {}): PostRecord {
  const now = new Date("2026-08-09T00:00:00.000Z");
  return {
    id: "post-1",
    type: "HIRE",
    title: "지입 차주 모집",
    content: "상세 내용",
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
    regionName: null,
    vehicleTypeName: null,
    tonnageName: null,
    attachments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPost", () => {
  it("클라이언트가 보낸 authorId는 검증에서 차단된다", async () => {
    await expect(
      createPost(USER_A, {
        type: "HIRE",
        title: "제목",
        content: "내용",
        authorId: "attacker-id",
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });
    expect(postDal.createPostRow).not.toHaveBeenCalled();
  });

  it("검증 실패 시 422 오류를 던진다", async () => {
    await expect(createPost(USER_A, { type: "BAD" })).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });
    expect(postDal.createPostRow).not.toHaveBeenCalled();
  });

  it("status가 PUBLISHED면 publishedAt이 설정된다", async () => {
    vi.mocked(postDal.createPostRow).mockResolvedValue(makePost());

    await createPost(USER_A, {
      type: "SEEK",
      title: "제목",
      content: "내용",
      status: "PUBLISHED",
    });

    const arg = vi.mocked(postDal.createPostRow).mock.calls[0][0];
    expect(arg.publishedAt).toBeInstanceOf(Date);
  });

  it("status가 DRAFT면 publishedAt은 null이다", async () => {
    vi.mocked(postDal.createPostRow).mockResolvedValue(makePost());

    await createPost(USER_A, { type: "HIRE", title: "제목", content: "내용" });

    const arg = vi.mocked(postDal.createPostRow).mock.calls[0][0];
    expect(arg.publishedAt).toBeNull();
  });

  it("존재하지 않는 마스터 데이터면 422 오류를 던진다", async () => {
    vi.mocked(prisma.region.findUnique).mockResolvedValue(null);

    await expect(
      createPost(USER_A, {
        type: "HIRE",
        title: "제목",
        content: "내용",
        regionId: "nope",
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(postDal.createPostRow).not.toHaveBeenCalled();
  });

  it("유효한 마스터 데이터면 정상 생성된다", async () => {
    vi.mocked(prisma.region.findUnique).mockResolvedValue({ id: "region-1" } as never);
    vi.mocked(postDal.createPostRow).mockResolvedValue(makePost());

    const post = await createPost(USER_A, {
      type: "HIRE",
      title: "제목",
      content: "내용",
      regionId: "region-1",
    });

    expect(post.id).toBe("post-1");
    expect(postDal.createPostRow).toHaveBeenCalledTimes(1);
    expect(postDal.createPostRow).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "user-1" }),
    );
  });
});

describe("getPostDetail", () => {
  it("PUBLISHED 게시글은 비로그인도 조회 가능하고 조회수가 증가한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost());

    const post = await getPostDetail(null, "post-1");

    expect(post.status).toBe("PUBLISHED");
    expect(postDal.incrementPostView).toHaveBeenCalledWith("post-1");
  });

  it("DRAFT 게시글은 작성자가 아니면 404를 반환한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost({ status: "DRAFT" }));

    await expect(getPostDetail(null, "post-1")).rejects.toMatchObject({ status: 404 });
    await expect(getPostDetail(USER_B, "post-1")).rejects.toMatchObject({ status: 404 });
    expect(postDal.incrementPostView).not.toHaveBeenCalled();
  });

  it("DRAFT 게시글은 작성자가 조회할 수 있다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost({ status: "DRAFT" }));

    const post = await getPostDetail(USER_A, "post-1");

    expect(post.status).toBe("DRAFT");
    expect(postDal.incrementPostView).not.toHaveBeenCalled();
  });

  it("삭제된 게시글은 404를 반환한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost({ deletedAt: new Date() }));

    await expect(getPostDetail(null, "post-1")).rejects.toMatchObject({ status: 404 });
  });

  it("존재하지 않는 게시글은 404를 반환한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(null);

    await expect(getPostDetail(null, "post-1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("updatePost", () => {
  it("작성자는 게시글을 수정할 수 있다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost());
    vi.mocked(postDal.updatePostRow).mockResolvedValue(makePost({ title: "새 제목" }));

    const post = await updatePost(USER_A, "post-1", { title: "새 제목" });

    expect(post.title).toBe("새 제목");
    expect(postDal.updatePostRow).toHaveBeenCalledWith("post-1", { title: "새 제목" });
  });

  it("다른 사용자는 수정할 수 없다 (403)", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost());

    await expect(updatePost(USER_B, "post-1", { title: "해킹" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(postDal.updatePostRow).not.toHaveBeenCalled();
  });

  it("없는 게시글 수정은 404를 반환한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(null);

    await expect(updatePost(USER_A, "nope", { title: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("DRAFT→PUBLISHED 전환 시 publishedAt이 없으면 설정한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost({ status: "DRAFT", publishedAt: null }));
    vi.mocked(postDal.updatePostRow).mockResolvedValue(makePost({ status: "PUBLISHED" }));

    await updatePost(USER_A, "post-1", { status: "PUBLISHED" });

    const patch = vi.mocked(postDal.updatePostRow).mock.calls[0][1];
    expect(patch.publishedAt).toBeInstanceOf(Date);
  });

  it("이미 publishedAt이 있으면 유지한다", async () => {
    const published = new Date("2026-01-01T00:00:00.000Z");
    vi.mocked(postDal.findPost).mockResolvedValue(
      makePost({ status: "CLOSED", publishedAt: published }),
    );
    vi.mocked(postDal.updatePostRow).mockResolvedValue(makePost({ status: "PUBLISHED" }));

    await updatePost(USER_A, "post-1", { status: "PUBLISHED" });

    const patch = vi.mocked(postDal.updatePostRow).mock.calls[0][1];
    expect(patch.publishedAt).toBeUndefined();
  });
});

describe("deletePost", () => {
  it("작성자는 게시글을 soft delete할 수 있다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost());

    const result = await deletePost(USER_A, "post-1");

    expect(result).toEqual({ id: "post-1" });
    expect(postDal.softDeletePostRow).toHaveBeenCalledWith("post-1");
    expect(postDal.softDeletePostAttachments).toHaveBeenCalledWith("post-1");
  });

  it("다른 사용자는 삭제할 수 없다 (403)", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost());

    await expect(deletePost(USER_B, "post-1")).rejects.toMatchObject({ status: 403 });
    expect(postDal.softDeletePostRow).not.toHaveBeenCalled();
  });

  it("삭제된 게시글은 404를 반환한다", async () => {
    vi.mocked(postDal.findPost).mockResolvedValue(makePost({ deletedAt: new Date() }));

    await expect(deletePost(USER_A, "post-1")).rejects.toMatchObject({ status: 404 });
  });
});
