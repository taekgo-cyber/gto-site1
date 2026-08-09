/**
 * Session 5 REST API를 호출하는 클라이언트 fetch 헬퍼.
 * 읽기(목록/상세)는 서버 컴포넌트에서 DAL을 통해 수행하므로,
 * 여기에는 쓰기(생성/수정/삭제)와 첨부파일 업로드/삭제만 정의한다.
 *
 * same-origin fetch이므로 세션 쿠키가 자동으로 전송되고,
 * 인증/권한/입력/파일 검증은 반드시 서버 API가 수행한다.
 */

export type LeasePostType = "HIRE" | "SEEK";
export type LeasePostStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "HIDDEN";
export type PayType = "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE";
export type WorkType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE";

export type PostWritePayload = {
  type: LeasePostType;
  title: string;
  content: string;
  status: LeasePostStatus;
  regionId?: string | null;
  vehicleTypeId?: string | null;
  tonnageId?: string | null;
  payType?: PayType | null;
  payAmount?: number | null;
  workType?: WorkType | null;
  conditions?: Record<string, unknown> | unknown[] | null;
};

export type PostUpdatePayload = Partial<PostWritePayload>;

export type AttachmentPublic = {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  mediaType: "IMAGE" | "DOCUMENT";
  sortOrder: number;
  isRepresentative: boolean;
  createdAt: string;
};

export type PostPublic = {
  id: string;
  type: LeasePostType;
  title: string;
  content: string;
  status: LeasePostStatus;
  viewCount: number;
  regionName: string | null;
  vehicleTypeName: string | null;
  tonnageName: string | null;
  payType: PayType | null;
  payAmount: number | null;
  workType: WorkType | null;
  conditions: unknown | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; nickname: string | null };
  attachments: AttachmentPublic[];
};

export type ApiFieldErrors = Record<string, string>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ApiFieldErrors;

  constructor(status: number, code: string, message: string, fields?: ApiFieldErrors) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: string; message?: string; fields?: ApiFieldErrors } }).error
        : undefined;
    throw new ApiClientError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "요청에 실패했습니다.",
      error?.fields,
    );
  }

  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function postUrl(id: string): string {
  return `/api/posts/${encodeURIComponent(id)}`;
}

export async function createPost(payload: PostWritePayload): Promise<PostPublic> {
  const response = await fetch("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<PostPublic>(response);
}

export async function updatePost(
  id: string,
  payload: PostUpdatePayload,
): Promise<PostPublic> {
  const response = await fetch(postUrl(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<PostPublic>(response);
}

export async function deletePost(id: string): Promise<void> {
  const response = await fetch(postUrl(id), { method: "DELETE" });
  await parseResponse<{ id: string }>(response);
}

export async function uploadAttachments(
  postId: string,
  files: File[],
): Promise<AttachmentPublic[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/attachments`, {
    method: "POST",
    body: formData,
  });
  return parseResponse<AttachmentPublic[]>(response);
}

export async function deleteAttachment(
  postId: string,
  attachmentId: string,
): Promise<void> {
  const response = await fetch(
    `/api/posts/${encodeURIComponent(postId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
  await parseResponse<{ id: string }>(response);
}
