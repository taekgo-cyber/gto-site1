export type ApiErrorFields = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ApiErrorFields;

  constructor(status: number, code: string, message: string, fields?: ApiErrorFields) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function badRequest(message = "요청이 올바르지 않습니다."): ApiError {
  return new ApiError(400, "BAD_REQUEST", message);
}

export function invalidJson(): ApiError {
  return new ApiError(400, "INVALID_JSON", "JSON 형식의 요청 본문이 필요합니다.");
}

export function unauthorized(message = "로그인이 필요합니다."): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "권한이 없습니다."): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "게시글을 찾을 수 없습니다."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function fileTooLarge(message = "파일 크기가 허용 범위를 초과합니다."): ApiError {
  return new ApiError(413, "PAYLOAD_TOO_LARGE", message);
}

export function validationError(
  fields: ApiErrorFields,
  message = "입력값이 올바르지 않습니다.",
): ApiError {
  return new ApiError(422, "VALIDATION_ERROR", message, fields);
}
