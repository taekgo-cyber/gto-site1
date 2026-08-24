"use client";

/* eslint-disable @next/next/no-img-element -- owner-only attachment and local blob previews must bypass the unauthenticated Next image optimizer. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import type { LeaseMasterData } from "@/lib/lease/dal";
import type { LeasePostStatus, PayType, WorkType } from "@/generated/prisma/enums";
import {
  MAX_ATTACHMENTS_PER_POST,
  MAX_FILE_SIZE_MB,
  ALLOWED_ATTACHMENT_EXTENSIONS,
} from "@/lib/lease/constants";
import {
  validateLeaseForm,
  validateAttachmentFiles,
  type LeaseFormFieldErrors,
} from "@/lib/lease/validation";
import type { SelectOption } from "@/lib/lease/options";
import {
  ApiClientError,
  createPost,
  deleteAttachment,
  updatePost,
  uploadAttachments,
  type AttachmentPublic,
  type PostWritePayload,
} from "@/lib/api/client";
import { buildAttachmentUrl } from "@/lib/attachments/url";
import { leasePostTypeLabel } from "@/lib/posts/labels";

export type LeasePostFormInitialValues = {
  type: "HIRE" | "SEEK";
  title: string;
  content: string;
  status: LeasePostStatus;
  regionId: string | null;
  vehicleTypeId: string | null;
  tonnageId: string | null;
  payType: PayType | null;
  payAmount: number | null;
  workType: WorkType | null;
  conditions: unknown | null;
};

type LeasePostFormProps = {
  mode: "create" | "edit";
  postId?: string;
  initialValues?: LeasePostFormInitialValues;
  initialAttachments?: AttachmentPublic[];
  masterData: LeaseMasterData;
  statusOptions: SelectOption<LeasePostStatus>[];
};

function conditionsToText(conditions: unknown): string {
  if (conditions && typeof conditions === "object" && !Array.isArray(conditions)) {
    const text = (conditions as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  if (Array.isArray(conditions)) {
    return conditions
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }
  return "";
}

export function LeasePostForm({
  mode,
  postId,
  initialValues,
  initialAttachments,
  masterData,
  statusOptions,
}: LeasePostFormProps) {
  const router = useRouter();

  const [values, setValues] = useState({
    type: initialValues?.type ?? ("" as "HIRE" | "SEEK" | ""),
    title: initialValues?.title ?? "",
    content: initialValues?.content ?? "",
    status: (initialValues?.status ?? "PUBLISHED") as LeasePostStatus,
    regionId: initialValues?.regionId ?? "",
    vehicleTypeId: initialValues?.vehicleTypeId ?? "",
    tonnageId: initialValues?.tonnageId ?? "",
    payType: initialValues?.payType ?? "",
    payAmount: initialValues?.payAmount != null ? String(initialValues.payAmount) : "",
    workType: initialValues?.workType ?? "",
    conditions: conditionsToText(initialValues?.conditions ?? null),
  });

  const [existingAttachments, setExistingAttachments] = useState<AttachmentPublic[]>(
    initialAttachments ?? [],
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<LeaseFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const totalAttachments = existingAttachments.length + newFiles.length;
  const targetPostId = mode === "edit" ? postId : createdId;

  function setField<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function buildPayload(): PostWritePayload {
    const payAmount =
      values.payType === "NEGOTIABLE" || values.payAmount.trim() === ""
        ? null
        : Number(values.payAmount);
    const conditions = values.conditions.trim()
      ? { text: values.conditions.trim() }
      : null;

    return {
      type: values.type as "HIRE" | "SEEK",
      title: values.title.trim(),
      content: values.content.trim(),
      status: values.status,
      regionId: values.regionId || null,
      vehicleTypeId: values.vehicleTypeId || null,
      tonnageId: values.tonnageId || null,
      payType: (values.payType || null) as PayType | null,
      payAmount: payAmount,
      workType: (values.workType || null) as WorkType | null,
      conditions,
    };
  }

  function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    const issues = validateAttachmentFiles(selected);
    if (issues.length > 0) {
      setFileError(issues[0].message);
      return;
    }

    if (totalAttachments + selected.length > MAX_ATTACHMENTS_PER_POST) {
      setFileError(`게시글당 첨부파일은 최대 ${MAX_ATTACHMENTS_PER_POST}개까지 허용됩니다.`);
      return;
    }

    setNewFiles((prev) => [...prev, ...selected]);
    setFileError(null);
  }

  function removeNewFile(index: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function removeExistingAttachment(attachment: AttachmentPublic) {
    if (!targetPostId) return;
    if (!window.confirm(`'${attachment.originalName}' 첨부파일을 삭제하시겠습니까?`)) return;

    try {
      await deleteAttachment(targetPostId, attachment.id);
      setExistingAttachments((prev) => {
        const next = prev.filter((item) => item.id !== attachment.id);
        if (attachment.isRepresentative) {
          const promoted = next.find((item) => item.mediaType === "IMAGE");
          if (promoted) {
            return next.map((item) =>
              item.id === promoted.id ? { ...item, isRepresentative: true } : item,
            );
          }
        }
        return next;
      });
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "첨부파일 삭제에 실패했습니다.");
    }
  }

  async function uploadNewFiles(postTargetId: string): Promise<void> {
    if (newFiles.length === 0) return;
    await uploadAttachments(postTargetId, newFiles);
    setNewFiles([]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateLeaseForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    setFileError(null);

    try {
      const payload = buildPayload();

      let postTargetId = targetPostId;
      if (mode === "edit") {
        if (!postTargetId) throw new Error("게시글 ID가 없습니다.");
        await updatePost(postTargetId, payload);
      } else {
        if (!postTargetId) {
          const post = await createPost(payload);
          setCreatedId(post.id);
          postTargetId = post.id;
        } else {
          await updatePost(postTargetId, payload);
        }
      }

      try {
        await uploadNewFiles(postTargetId);
      } catch (err) {
        setFormError(
          `첨부파일 업로드에 실패했습니다. 게시글은 저장되었으니 첨부파일만 다시 등록해 주세요. (${
            err instanceof Error ? err.message : ""
          })`,
        );
        setPending(false);
        return;
      }

      router.push(`/lease/${postTargetId}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fields && Object.keys(err.fields).length > 0) setFieldErrors(err.fields);
        setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : "요청에 실패했습니다.");
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border border-border bg-background p-4 sm:p-5">
        <h2 className="mb-4 text-base font-semibold">기본 정보</h2>

        <fieldset className="mb-4">
          <legend className="mb-1.5 block text-sm font-medium">게시글 유형</legend>
          <div className="flex flex-wrap gap-4">
            {(["HIRE", "SEEK"] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={values.type === type}
                  onChange={() => setField("type", type)}
                />
                {leasePostTypeLabel(type)}
              </label>
            ))}
          </div>
          {fieldErrors.type ? (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.type}</p>
          ) : null}
        </fieldset>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              name="title"
              value={values.title}
              onChange={(event) => setField("title", event.target.value)}
              placeholder="제목을 입력해 주세요."
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title ? (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="content">상세 내용</Label>
            <textarea
              id="content"
              name="content"
              value={values.content}
              onChange={(event) => setField("content", event.target.value)}
              rows={8}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 sm:text-sm",
                fieldErrors.content ? "border-red-400" : "border-border",
              )}
              placeholder="운송 조건, 계약 조건 등 상세 내용을 작성해 주세요."
              aria-invalid={Boolean(fieldErrors.content)}
            />
            {fieldErrors.content ? (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.content}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="status">게시 상태</Label>
            <Select
              id="status"
              name="status"
              value={values.status}
              onChange={(event) => setField("status", event.target.value as LeasePostStatus)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-4 sm:p-5">
        <h2 className="mb-4 text-base font-semibold">운송 조건</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="regionId">지역</Label>
            <Select
              id="regionId"
              name="regionId"
              value={values.regionId}
              onChange={(event) => setField("regionId", event.target.value)}
            >
              <option value="">선택 안 함</option>
              {masterData.regions.map((province) => (
                <optgroup key={province.id} label={province.name}>
                  <option value={province.id}>{province.name} 전체</option>
                  {province.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="vehicleTypeId">차종</Label>
            <Select
              id="vehicleTypeId"
              name="vehicleTypeId"
              value={values.vehicleTypeId}
              onChange={(event) => setField("vehicleTypeId", event.target.value)}
            >
              <option value="">선택 안 함</option>
              {masterData.vehicleTypes.map((vehicleType) => (
                <option key={vehicleType.id} value={vehicleType.id}>
                  {vehicleType.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="tonnageId">톤수</Label>
            <Select
              id="tonnageId"
              name="tonnageId"
              value={values.tonnageId}
              onChange={(event) => setField("tonnageId", event.target.value)}
            >
              <option value="">선택 안 함</option>
              {masterData.tonnages.map((tonnage) => (
                <option key={tonnage.id} value={tonnage.id}>
                  {tonnage.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="payType">급여 유형</Label>
            <Select
              id="payType"
              name="payType"
              value={values.payType}
              onChange={(event) => setField("payType", event.target.value)}
            >
              <option value="">선택 안 함</option>
              <option value="MONTHLY">월급</option>
              <option value="DAILY">일급</option>
              <option value="FREIGHT">운임</option>
              <option value="NEGOTIABLE">협의</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="payAmount">급여/매출 (만원 단위)</Label>
            <Input
              id="payAmount"
              name="payAmount"
              type="number"
              min={0}
              inputMode="numeric"
              value={values.payAmount}
              onChange={(event) => setField("payAmount", event.target.value)}
              placeholder="예) 320"
              aria-invalid={Boolean(fieldErrors.payAmount)}
            />
            {fieldErrors.payAmount ? (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.payAmount}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="workType">근무 형태</Label>
            <Select
              id="workType"
              name="workType"
              value={values.workType}
              onChange={(event) => setField("workType", event.target.value)}
            >
              <option value="">선택 안 함</option>
              <option value="FULL_TIME">정규직</option>
              <option value="PART_TIME">아르바이트</option>
              <option value="CONTRACT">계약직</option>
              <option value="DAILY">일용직</option>
              <option value="FREELANCE">프리랜서</option>
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="conditions">기타 조건</Label>
          <textarea
            id="conditions"
            name="conditions"
            value={values.conditions}
            onChange={(event) => setField("conditions", event.target.value)}
            rows={3}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 sm:text-sm",
              "border-border",
            )}
            placeholder="예) 야간 운행 가능자 우대, 경력 우대, 차량 지원 등"
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-4 sm:p-5">
        <h2 className="mb-1 text-base font-semibold">첨부파일</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          이미지(jpg, png, gif, webp) 또는 PDF · 파일당 최대 {MAX_FILE_SIZE_MB}MB ·
          게시글당 최대 {MAX_ATTACHMENTS_PER_POST}개. 첫 번째 이미지가 대표 이미지로
          사용됩니다.
        </p>

        <input
          id="attachments"
          type="file"
          multiple
          accept={ALLOWED_ATTACHMENT_EXTENSIONS.join(",")}
          onChange={handleFilesChange}
          className="mb-4 block min-h-11 w-full text-sm text-muted-foreground file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
        />

        {existingAttachments.length > 0 ? (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium">등록된 첨부파일</h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {existingAttachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="rounded-md border border-border p-2"
                >
                  {attachment.mediaType === "IMAGE" ? (
                    <div className="relative mb-2 h-28 w-full overflow-hidden rounded bg-surface">
                      <img
                        src={buildAttachmentUrl(targetPostId ?? "", attachment.id)}
                        alt={attachment.originalName}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      {attachment.isRepresentative ? (
                        <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                          대표
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mb-2 truncate text-sm text-foreground">
                      📄 {attachment.originalName}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {attachment.originalName}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(attachment)}
                      className="inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded px-3 text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {newFiles.length > 0 ? (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium">새로 추가할 파일</h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {newFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="rounded-md border border-border p-2">
                  {file.type.startsWith("image/") ? (
                    <div className="relative mb-2 h-28 w-full overflow-hidden rounded bg-surface">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <p className="mb-2 truncate text-sm text-foreground">
                      📄 {file.name}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeNewFile(index)}
                      className="inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded px-3 text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {fileError ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {fileError}
          </p>
        ) : null}
      </section>

      {formError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? mode === "edit"
              ? "저장 중..."
              : "등록 중..."
            : mode === "edit"
              ? "저장하기"
              : "등록하기"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => router.back()}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
