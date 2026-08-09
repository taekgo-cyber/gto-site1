export type PostFieldErrors = Record<string, string>;

export const TITLE_MAX = 100;
export const CONTENT_MAX = 5000;
export const PAY_AMOUNT_MIN = 0;
export const PAY_AMOUNT_MAX = 1_000_000_000;
export const CONDITIONS_MAX_CHARS = 8192;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

const ALLOWED_TYPES = new Set(["HIRE", "SEEK"]);
const ALLOWED_STATUSES = new Set(["DRAFT", "PUBLISHED", "CLOSED", "HIDDEN"]);
const ALLOWED_PAY_TYPES = new Set(["MONTHLY", "DAILY", "FREIGHT", "NEGOTIABLE"]);
const ALLOWED_WORK_TYPES = new Set([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "DAILY",
  "FREELANCE",
]);

const CREATE_ALLOWED_KEYS = new Set([
  "type",
  "title",
  "content",
  "status",
  "regionId",
  "vehicleTypeId",
  "tonnageId",
  "payType",
  "payAmount",
  "workType",
  "conditions",
]);

const UPDATE_ALLOWED_KEYS = new Set([
  "title",
  "content",
  "type",
  "status",
  "regionId",
  "vehicleTypeId",
  "tonnageId",
  "payType",
  "payAmount",
  "workType",
  "conditions",
]);

export type PostCreateInput = {
  type: "HIRE" | "SEEK";
  title: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "HIDDEN";
  regionId?: string;
  vehicleTypeId?: string;
  tonnageId?: string;
  payType?: "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE";
  payAmount?: number;
  workType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE";
  conditions?: Record<string, unknown> | unknown[];
};

export type PostUpdateInput = Partial<{
  type: "HIRE" | "SEEK";
  title: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "HIDDEN";
  regionId: string | null;
  vehicleTypeId: string | null;
  tonnageId: string | null;
  payType: "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE" | null;
  payAmount: number | null;
  workType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE" | null;
  conditions: Record<string, unknown> | unknown[] | null;
}>;

export type PostListQuery = {
  type?: "HIRE" | "SEEK";
  regionId?: string;
  vehicleTypeId?: string;
  tonnageId?: string;
  payType?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

export type PostListQueryResult = {
  query: PostListQuery;
  errors: PostFieldErrors;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowed: Set<string>,
  errors: PostFieldErrors,
): void {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      errors[key] = "허용되지 않는 필드입니다.";
    }
  }
}

function rejectProtectedKeys(body: Record<string, unknown>, errors: PostFieldErrors): void {
  for (const key of [
    "id",
    "authorId",
    "companyId",
    "viewCount",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ]) {
    if (key in body) {
      errors[key] = "변경할 수 없는 필드입니다.";
    }
  }
}

function validateTitle(value: unknown, errors: PostFieldErrors): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    errors.title = "제목을 입력해 주세요.";
    return undefined;
  }
  const title = value.trim();
  if (title.length > TITLE_MAX) {
    errors.title = `제목은 ${TITLE_MAX}자 이하여야 합니다.`;
    return undefined;
  }
  return title;
}

function validateContent(value: unknown, errors: PostFieldErrors): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    errors.content = "내용을 입력해 주세요.";
    return undefined;
  }
  const content = value.trim();
  if (content.length > CONTENT_MAX) {
    errors.content = `내용은 ${CONTENT_MAX}자 이하여야 합니다.`;
    return undefined;
  }
  return content;
}

function validateType(value: unknown, errors: PostFieldErrors): "HIRE" | "SEEK" | undefined {
  if (typeof value !== "string" || !ALLOWED_TYPES.has(value)) {
    errors.type = "게시글 유형은 HIRE(구인) 또는 SEEK(구직)만 사용할 수 있습니다.";
    return undefined;
  }
  return value as "HIRE" | "SEEK";
}

function validateStatus(
  value: unknown,
  errors: PostFieldErrors,
): "DRAFT" | "PUBLISHED" | "CLOSED" | "HIDDEN" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ALLOWED_STATUSES.has(value)) {
    errors.status = "허용되지 않는 게시글 상태입니다.";
    return undefined;
  }
  return value as "DRAFT" | "PUBLISHED" | "CLOSED" | "HIDDEN";
}

function validateOptionalId(
  key: string,
  value: unknown,
  errors: PostFieldErrors,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    errors[key] = "올바른 ID가 아닙니다.";
    return undefined;
  }
  return value.trim();
}

function validatePayType(
  value: unknown,
  errors: PostFieldErrors,
): "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ALLOWED_PAY_TYPES.has(value)) {
    errors.payType = "허용되지 않는 급여 유형입니다.";
    return undefined;
  }
  return value as "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE";
}

function validateWorkType(
  value: unknown,
  errors: PostFieldErrors,
): "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ALLOWED_WORK_TYPES.has(value)) {
    errors.workType = "허용되지 않는 근무 형태입니다.";
    return undefined;
  }
  return value as "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE";
}

function validatePayAmount(value: unknown, errors: PostFieldErrors): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.payAmount = "급여/매출 금액은 정수여야 합니다.";
    return undefined;
  }
  if (value < PAY_AMOUNT_MIN || value > PAY_AMOUNT_MAX) {
    errors.payAmount = `금액은 ${PAY_AMOUNT_MIN} ~ ${PAY_AMOUNT_MAX} 범위여야 합니다.`;
    return undefined;
  }
  return value;
}

function validateConditions(
  value: unknown,
  errors: PostFieldErrors,
): Record<string, unknown> | unknown[] | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) && !isRecordArray(value)) {
    errors.conditions = "조건은 객체 또는 배열 형식이어야 합니다.";
    return undefined;
  }
  const json = JSON.stringify(value);
  if (json.length > CONDITIONS_MAX_CHARS) {
    errors.conditions = `조건 데이터가 너무 큽니다. (최대 ${CONDITIONS_MAX_CHARS}자)`;
    return undefined;
  }
  return value;
}

export function parseCreateInput(
  raw: Record<string, unknown>,
): { data?: PostCreateInput; errors: PostFieldErrors } {
  const errors: PostFieldErrors = {};

  rejectUnknownKeys(raw, CREATE_ALLOWED_KEYS, errors);
  rejectProtectedKeys(raw, errors);

  const type = validateType(raw.type, errors);
  const title = validateTitle(raw.title, errors);
  const content = validateContent(raw.content, errors);
  const status = validateStatus(raw.status, errors);
  const regionId = validateOptionalId("regionId", raw.regionId, errors);
  const vehicleTypeId = validateOptionalId("vehicleTypeId", raw.vehicleTypeId, errors);
  const tonnageId = validateOptionalId("tonnageId", raw.tonnageId, errors);
  const payType = validatePayType(raw.payType, errors);
  const workType = validateWorkType(raw.workType, errors);
  const payAmount = validatePayAmount(raw.payAmount, errors);
  const conditions = validateConditions(raw.conditions, errors);

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors: {},
    data: {
      type: type as "HIRE" | "SEEK",
      title: title as string,
      content: content as string,
      status: status ?? "DRAFT",
      ...(regionId !== undefined && { regionId }),
      ...(vehicleTypeId !== undefined && { vehicleTypeId }),
      ...(tonnageId !== undefined && { tonnageId }),
      ...(payType !== undefined && { payType }),
      ...(workType !== undefined && { workType }),
      ...(payAmount !== undefined && { payAmount }),
      ...(conditions !== undefined && { conditions }),
    },
  };
}

export function parseUpdateInput(
  raw: Record<string, unknown>,
): { data?: PostUpdateInput; errors: PostFieldErrors } {
  const errors: PostFieldErrors = {};

  rejectUnknownKeys(raw, UPDATE_ALLOWED_KEYS, errors);
  rejectProtectedKeys(raw, errors);

  const hasEditableField = Object.keys(raw).some((key) => UPDATE_ALLOWED_KEYS.has(key));
  if (!hasEditableField) {
    errors.form = "수정할 내용이 없습니다.";
    return { errors };
  }

  const data: PostUpdateInput = {};

  if ("title" in raw) {
    const title = validateTitle(raw.title, errors);
    if (title !== undefined) data.title = title;
  }
  if ("content" in raw) {
    const content = validateContent(raw.content, errors);
    if (content !== undefined) data.content = content;
  }
  if ("type" in raw) {
    const type = validateType(raw.type, errors);
    if (type !== undefined) data.type = type;
  }
  if ("status" in raw) {
    const status = validateStatus(raw.status, errors);
    if (status !== undefined) data.status = status;
  }
  if ("regionId" in raw) {
    if (raw.regionId === null) {
      data.regionId = null;
    } else {
      const regionId = validateOptionalId("regionId", raw.regionId, errors);
      if (regionId !== undefined) data.regionId = regionId;
    }
  }
  if ("vehicleTypeId" in raw) {
    if (raw.vehicleTypeId === null) {
      data.vehicleTypeId = null;
    } else {
      const vehicleTypeId = validateOptionalId("vehicleTypeId", raw.vehicleTypeId, errors);
      if (vehicleTypeId !== undefined) data.vehicleTypeId = vehicleTypeId;
    }
  }
  if ("tonnageId" in raw) {
    if (raw.tonnageId === null) {
      data.tonnageId = null;
    } else {
      const tonnageId = validateOptionalId("tonnageId", raw.tonnageId, errors);
      if (tonnageId !== undefined) data.tonnageId = tonnageId;
    }
  }
  if ("payType" in raw) {
    if (raw.payType === null) {
      data.payType = null;
    } else {
      const payType = validatePayType(raw.payType, errors);
      if (payType !== undefined) data.payType = payType;
    }
  }
  if ("workType" in raw) {
    if (raw.workType === null) {
      data.workType = null;
    } else {
      const workType = validateWorkType(raw.workType, errors);
      if (workType !== undefined) data.workType = workType;
    }
  }
  if ("payAmount" in raw) {
    if (raw.payAmount === null) {
      data.payAmount = null;
    } else {
      const payAmount = validatePayAmount(raw.payAmount, errors);
      if (payAmount !== undefined) data.payAmount = payAmount;
    }
  }
  if ("conditions" in raw) {
    if (raw.conditions === null) {
      data.conditions = null;
    } else {
      const conditions = validateConditions(raw.conditions, errors);
      if (conditions !== undefined) data.conditions = conditions;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { errors: {}, data };
}

export function parseListQuery(searchParams: URLSearchParams): PostListQueryResult {
  const errors: PostFieldErrors = {};

  const typeParam = searchParams.get("type");
  const type =
    typeParam === "HIRE" || typeParam === "SEEK" ? typeParam : undefined;
  if (typeParam !== null && type === undefined) {
    errors.type = "type은 HIRE 또는 SEEK만 사용할 수 있습니다.";
  }

  const regionId = searchParams.get("regionId") || undefined;
  const vehicleTypeId = searchParams.get("vehicleTypeId") || undefined;
  const tonnageId = searchParams.get("tonnageId") || undefined;
  const payTypeParam = searchParams.get("payType");
  const payType =
    payTypeParam !== null && ALLOWED_PAY_TYPES.has(payTypeParam)
      ? payTypeParam
      : undefined;
  if (payTypeParam !== null && payType === undefined) {
    errors.payType = "허용되지 않는 급여 유형입니다.";
  }

  const keyword = searchParams.get("keyword")?.trim() || undefined;

  const rawPage = Number(searchParams.get("page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawPageSize = Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    errors,
    query: {
      type,
      regionId,
      vehicleTypeId,
      tonnageId,
      payType,
      keyword,
      page,
      pageSize,
    },
  };
}
