import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { LeasePostForm } from "@/components/lease/LeasePostForm";
import { requireUser } from "@/lib/auth/dal";
import { getLeaseMasterData } from "@/lib/lease/dal";
import { CREATE_STATUS_OPTIONS } from "@/lib/lease/options";

export const metadata: Metadata = {
  title: "지입 게시글 작성",
};

export default async function LeaseWritePage() {
  await requireUser();
  const masterData = await getLeaseMasterData();

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">지입 게시글 작성</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          지입 구인/구직 게시글을 등록합니다.
        </p>
      </div>
      <LeasePostForm
        mode="create"
        masterData={masterData}
        statusOptions={CREATE_STATUS_OPTIONS}
      />
    </Container>
  );
}
