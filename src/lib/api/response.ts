import { NextResponse } from "next/server";
import { ApiError, invalidJson } from "./errors";

export function json<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json({ data }, { status: init?.status ?? 200 });
}

export function errorResponse(error: ApiError): NextResponse {
  const errorBody: Record<string, unknown> = {
    code: error.code,
    message: error.message,
  };
  if (error.fields) {
    errorBody.fields = error.fields;
  }
  return NextResponse.json({ error: errorBody }, { status: error.status });
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(500, "INTERNAL_SERVER_ERROR", "서버 오류가 발생했습니다.");
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw invalidJson();
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw invalidJson();
  }
  return body as T;
}
