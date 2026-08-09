"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { deletePost } from "@/lib/api/client";

export function LeaseDeleteButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("정말로 이 게시글을 삭제하시겠습니까?")) return;

    setPending(true);
    setError(null);
    try {
      await deletePost(postId);
      router.push("/lease");
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={handleDelete}
        disabled={pending}
        className="text-red-600 hover:bg-red-50"
      >
        {pending ? "삭제 중..." : "삭제"}
      </Button>
    </div>
  );
}
