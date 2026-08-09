import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiUser } from "@/lib/api/auth";
import { forbidden, notFound, unauthorized, validationError } from "@/lib/api/errors";
import type { PostPublic } from "@/lib/posts/service";

vi.mock("@/lib/api/auth", () => ({
  getApiUser: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/posts/service", () => ({
  createPost: vi.fn(),
  deletePost: vi.fn(),
  getPostDetail: vi.fn(),
  updatePost: vi.fn(),
}));

vi.mock("@/lib/posts/dal", () => ({
  getPostList: vi.fn(),
}));

import * as auth from "@/lib/api/auth";
import * as postService from "@/lib/posts/service";
import { getPostList } from "@/lib/posts/dal";
import * as postsRoute from "@/app/api/posts/route";
import * as postItemRoute from "@/app/api/posts/[id]/route";

const USER: ApiUser = { id: "user-1", email: "a@test.com", role: "USER", status: "ACTIVE" };

const POST: PostPublic = {
  id: "post-1",
  type: "HIRE",
  title: "제목",
  content: "내용",
  status: "PUBLISHED",
  viewCount: 0,
  regionName: null,
  vehicleTypeName: null,
  tonnageName: null,
  payType: null,
  payAmount: null,
  workType: null,
  conditions: null,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: "user-1", name: "홍길동", nickname: null },
  attachments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/posts", () => {
  it("로그인하지 않으면 401을 반환한다", async () => {
    vi.mocked(auth.requireApiUser).mockRejectedValue(unauthorized());

    const response = await postsRoute.POST(
      new Request("http://localhost/api/posts", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("정상 입력이면 201과 게시글을 반환한다", async () => {
    vi.mocked(auth.requireApiUser).mockResolvedValue(USER);
    vi.mocked(postService.createPost).mockResolvedValue(POST);

    const response = await postsRoute.POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "HIRE", title: "제목", content: "내용" }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("post-1");
    expect(postService.createPost).toHaveBeenCalledWith(USER, {
      type: "HIRE",
      title: "제목",
      content: "내용",
    });
  });

  it("JSON이 아닌 본문이면 400을 반환한다", async () => {
    vi.mocked(auth.requireApiUser).mockResolvedValue(USER);

    const response = await postsRoute.POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
  });

  it("검증 실패 시 422를 반환한다", async () => {
    vi.mocked(auth.requireApiUser).mockResolvedValue(USER);
    vi.mocked(postService.createPost).mockRejectedValue(
      validationError({ title: "제목을 입력해 주세요." }),
    );

    const response = await postsRoute.POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "HIRE" }),
      }),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields.title).toBeDefined();
  });
});

describe("GET /api/posts", () => {
  it("목록과 페이지네이션을 반환한다", async () => {
    vi.mocked(getPostList).mockResolvedValue({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await postsRoute.GET(new Request("http://localhost/api/posts"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.pagination.page).toBe(1);
    expect(getPostList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it("잘못된 필터면 422를 반환한다", async () => {
    const response = await postsRoute.GET(
      new Request("http://localhost/api/posts?type=BAD"),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/posts/:id", () => {
  it("게시글 상세를 반환한다", async () => {
    vi.mocked(auth.getApiUser).mockResolvedValue(null);
    vi.mocked(postService.getPostDetail).mockResolvedValue(POST);

    const response = await postItemRoute.GET(new Request("http://localhost/api/posts/post-1"), {
      params: Promise.resolve({ id: "post-1" }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.id).toBe("post-1");
  });

  it("비공개 게시글은 404를 반환한다", async () => {
    vi.mocked(auth.getApiUser).mockResolvedValue(null);
    vi.mocked(postService.getPostDetail).mockRejectedValue(notFound());

    const response = await postItemRoute.GET(new Request("http://localhost/api/posts/post-1"), {
      params: Promise.resolve({ id: "post-1" }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/posts/:id", () => {
  it("작성자는 수정할 수 있다", async () => {
    vi.mocked(auth.requireApiUser).mockResolvedValue(USER);
    vi.mocked(postService.updatePost).mockResolvedValue(POST);

    const response = await postItemRoute.PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "새 제목" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(200);
    expect(postService.updatePost).toHaveBeenCalledWith(USER, "post-1", {
      title: "새 제목",
    });
  });

  it("작성자가 아니면 403을 반환한다", async () => {
    vi.mocked(auth.requireApiUser).mockResolvedValue(USER);
    vi.mocked(postService.updatePost).mockRejectedValue(forbidden());

    const response = await postItemRoute.PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "새 제목" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/posts/:id", () => {
  it("작성자는 삭제할 수 있다", async () => {
    vi.mocked(auth.requireApiUser).mockResolvedValue(USER);
    vi.mocked(postService.deletePost).mockResolvedValue({ id: "post-1" });

    const response = await postItemRoute.DELETE(
      new Request("http://localhost/api/posts/post-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.id).toBe("post-1");
  });

  it("로그인하지 않으면 401을 반환한다", async () => {
    vi.mocked(auth.requireApiUser).mockRejectedValue(unauthorized());

    const response = await postItemRoute.DELETE(
      new Request("http://localhost/api/posts/post-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(401);
  });
});
