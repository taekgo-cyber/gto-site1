"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("app_render_error", {
      digest: error.digest ?? null,
      name: error.name,
    });
  }, [error]);

  return (
    <Container className="flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">일시적인 오류</p>
        <h1 className="text-2xl font-bold">페이지를 불러오지 못했습니다.</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 홈으로 이동해 다른 메뉴를 이용할 수 있습니다.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          다시 시도
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          홈으로
        </Link>
      </div>
    </Container>
  );
}
