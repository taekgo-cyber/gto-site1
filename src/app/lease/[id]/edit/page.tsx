import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/common/Container";
import {
  LeasePostForm,
  type LeasePostFormInitialValues,
} from "@/components/lease/LeasePostForm";
import { requireUser } from "@/lib/auth/dal";
import { getLeaseMasterData } from "@/lib/lease/dal";
import { EDIT_STATUS_OPTIONS } from "@/lib/lease/options";
import { findPost } from "@/lib/posts/dal";

export const metadata: Metadata = {
  title: "지입 게시글 수정",
};

export default async function LeaseEditPage(props: PageProps<"/lease/[id]/edit">) {
  const { id } = await props.params;
  const user = await requireUser();

  const record = await findPost(id);
  if (!record || record.deletedAt !== null || record.authorId !== user.id) {
    notFound();
  }

  const masterData = await getLeaseMasterData();

  const initialValues: LeasePostFormInitialValues = {
    type: record.type,
    title: record.title,
    content: record.content,
    status: record.status,
    regionId: record.regionId,
    vehicleTypeId: record.vehicleTypeId,
    tonnageId: record.tonnageId,
    payType: record.payType,
    payAmount: record.payAmount,
    workType: record.workType,
    conditions: record.conditions,
  };

  const initialAttachments = record.attachments.map((attachment) => ({
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    mediaType: attachment.mediaType,
    sortOrder: attachment.sortOrder,
    isRepresentative: attachment.isRepresentative,
    createdAt: attachment.createdAt.toISOString(),
  }));

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">지입 게시글 수정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          게시글 정보를 수정합니다. 최종 저장은 서버에서 권한을 다시 확인합니다.
        </p>
      </div>
      <LeasePostForm
        mode="edit"
        postId={id}
        initialValues={initialValues}
        initialAttachments={initialAttachments}
        masterData={masterData}
        statusOptions={EDIT_STATUS_OPTIONS}
      />
    </Container>
  );
}
