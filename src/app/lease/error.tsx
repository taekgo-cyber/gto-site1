"use client";

import { useEffect } from "react";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";

export default function LeaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16 text-center">
      <h1 className="text-lg font-semibold">게시글 목록을 불러오지 못했습니다.</h1>
      <p className="mt-2 text-sm text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
      <Button onClick={reset} className="mt-6">
        다시 시도
      </Button>
    </Container>
  );
}
