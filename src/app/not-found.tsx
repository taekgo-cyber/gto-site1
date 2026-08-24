import Link from "next/link";
import { Container } from "@/components/common/Container";

export default function NotFound() {
  return (
    <Container className="flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다.</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          주소가 변경되었거나 더 이상 제공되지 않는 페이지일 수 있습니다.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        홈으로 돌아가기
      </Link>
    </Container>
  );
}
