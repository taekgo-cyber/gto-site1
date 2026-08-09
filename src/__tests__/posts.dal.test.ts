/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import {
  countPostAttachments,
  createManyAttachmentRows,
  createPostRow,
  findAttachment,
  findPost,
  getPostList,
  incrementPostView,
  listPostAttachments,
  removeAttachmentRow,
  softDeletePostAttachments,
  softDeletePostRow,
} from "@/lib/posts/dal";

type Row = Record<string, any>;

let db: ReturnType<typeof createFakeDb>;

function postRow(overrides: Row = {}): Row {
  const now = new Date("2026-08-09T00:00:00.000Z");
  return {
    id: `post-${Math.random().toString(36).slice(2, 10)}`,
    type: "HIRE",
    title: "제목",
    content: "내용",
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

beforeEach(() => {
  db = createFakeDb();
  dbHolder.current = db;
});

describe("getPostList", () => {
  it("PUBLISHED 게시글만 반환한다", async () => {
    db.seed.addPost(postRow({ title: "공개" }));
    db.seed.addPost(postRow({ title: "임시", status: "DRAFT" }));
    db.seed.addPost(postRow({ title: "마감", status: "CLOSED" }));

    const result = await getPostList({ page: 1, pageSize: 10 });

    expect(result.totalCount).toBe(1);
    expect(result.items[0].title).toBe("공개");
  });

  it("soft delete된 게시글은 제외된다", async () => {
    db.seed.addPost(postRow({ title: "삭제됨", deletedAt: new Date() }));
    db.seed.addPost(postRow({ title: "살아있음" }));

    const result = await getPostList({ page: 1, pageSize: 10 });

    expect(result.totalCount).toBe(1);
    expect(result.items[0].title).toBe("살아있음");
  });

  it("type/regionId/키워드 필터가 동작한다", async () => {
    db.seed.addPost(postRow({ title: "지입 구인", type: "HIRE", regionId: "region-1" }));
    db.seed.addPost(postRow({ title: "지입 구직", type: "SEEK", regionId: "region-1" }));
    db.seed.addPost(postRow({ title: "다른 지역", type: "HIRE", regionId: "region-2" }));

    const hire = await getPostList({ page: 1, pageSize: 10, type: "HIRE" });
    expect(hire.totalCount).toBe(2);

    const region = await getPostList({ page: 1, pageSize: 10, regionId: "region-1" });
    expect(region.totalCount).toBe(2);

    const keyword = await getPostList({ page: 1, pageSize: 10, keyword: "구직" });
    expect(keyword.totalCount).toBe(1);
  });

  it("페이지네이션이 동작한다", async () => {
    for (let index = 0; index < 3; index += 1) {
      db.seed.addPost(postRow({ title: `게시글 ${index}` }));
    }

    const page1 = await getPostList({ page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.totalCount).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await getPostList({ page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
  });
});

describe("findPost / createPostRow / softDeletePostRow / incrementPostView", () => {
  it("createPostRow가 PostRecord를 반환하고 findPost로 조회된다", async () => {
    const created = await createPostRow({
      type: "HIRE",
      title: "새 글",
      content: "본문",
      status: "PUBLISHED",
      authorId: "user-1",
      publishedAt: new Date(),
    });

    expect(created.id).toBeTruthy();
    expect(created.author.id).toBe("user-1");

    const found = await findPost(created.id);
    expect(found?.title).toBe("새 글");
  });

  it("없는 ID는 null을 반환한다", async () => {
    expect(await findPost("nope")).toBeNull();
  });

  it("softDeletePostRow 후 deletedAt이 설정된다", async () => {
    const created = await createPostRow({
      type: "HIRE",
      title: "삭제 대상",
      content: "본문",
      status: "PUBLISHED",
      authorId: "user-1",
      publishedAt: new Date(),
    });

    await softDeletePostRow(created.id);

    const found = await findPost(created.id);
    expect(found?.deletedAt).not.toBeNull();
  });

  it("incrementPostView가 조회수를 증가시킨다", async () => {
    const created = await createPostRow({
      type: "HIRE",
      title: "조회수",
      content: "본문",
      status: "PUBLISHED",
      authorId: "user-1",
      publishedAt: new Date(),
    });

    const viewCount = await incrementPostView(created.id);

    expect(viewCount).toBe(1);
    expect((await findPost(created.id))?.viewCount).toBe(1);
  });
});

describe("attachment dal", () => {
  it("createManyAttachmentRows 후 목록/개수 조회가 동작한다", async () => {
    const post = await createPostRow({
      type: "HIRE",
      title: "첨부 글",
      content: "본문",
      status: "PUBLISHED",
      authorId: "user-1",
      publishedAt: new Date(),
    });

    await createManyAttachmentRows([
      {
        postId: post.id,
        storageKey: `${post.id}/key1.png`,
        originalName: "a.png",
        mimeType: "image/png",
        fileSize: 10,
        mediaType: "IMAGE",
        sortOrder: 0,
        isRepresentative: true,
      },
    ]);

    expect(await countPostAttachments(post.id)).toBe(1);

    const list = await listPostAttachments(post.id);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("storageKey");
    expect(list[0].id).toBeTruthy();
  });

  it("findAttachment는 storageKey를 포함해 반환한다", async () => {
    const post = await createPostRow({
      type: "HIRE",
      title: "본문",
      content: "내용",
      status: "PUBLISHED",
      authorId: "user-1",
      publishedAt: new Date(),
    });
    await createManyAttachmentRows([
      {
        postId: post.id,
        storageKey: `${post.id}/secret.png`,
        originalName: "a.png",
        mimeType: "image/png",
        fileSize: 10,
        mediaType: "IMAGE",
        sortOrder: 0,
        isRepresentative: false,
      },
    ]);

    const list = await listPostAttachments(post.id);
    const row = await findAttachment(list[0].id);

    expect(row).not.toBeNull();
    expect(row?.storageKey).toBe(`${post.id}/secret.png`);
    expect(row?.originalName).toBe("a.png");
  });

  it("softDeletePostAttachments/removeAttachmentRow가 동작한다", async () => {
    const post = await createPostRow({
      type: "HIRE",
      title: "본문",
      content: "내용",
      status: "PUBLISHED",
      authorId: "user-1",
      publishedAt: new Date(),
    });
    await createManyAttachmentRows([
      {
        postId: post.id,
        storageKey: `${post.id}/key.png`,
        originalName: "a.png",
        mimeType: "image/png",
        fileSize: 10,
        mediaType: "IMAGE",
        sortOrder: 0,
        isRepresentative: false,
      },
    ]);

    await softDeletePostAttachments(post.id);
    expect(await countPostAttachments(post.id)).toBe(0);

    await createManyAttachmentRows([
      {
        postId: post.id,
        storageKey: `${post.id}/key2.png`,
        originalName: "b.png",
        mimeType: "image/png",
        fileSize: 20,
        mediaType: "IMAGE",
        sortOrder: 1,
        isRepresentative: false,
      },
    ]);
    const list = await listPostAttachments(post.id);
    await removeAttachmentRow(list[0].id);
    expect(await countPostAttachments(post.id)).toBe(0);
  });
});
