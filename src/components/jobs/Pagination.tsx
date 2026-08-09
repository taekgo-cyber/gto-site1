import Link from "next/link";
import { cn } from "@/lib/utils";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  query: Record<string, string | undefined>;
};

function buildHref(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

function pageWindow(currentPage: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function Pagination({ currentPage, totalPages, query }: PaginationProps) {
  if (totalPages <= 1) return null;

  const linkClasses = (disabled: boolean) =>
    cn(
      "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border px-3 text-sm transition-colors",
      disabled
        ? "pointer-events-none opacity-40"
        : "hover:bg-surface",
    );

  const pages = pageWindow(currentPage, totalPages);

  return (
    <nav
      aria-label="페이지 네비게이션"
      className="flex flex-wrap items-center justify-center gap-1.5"
    >
      <Link
        href={buildHref(query, currentPage - 1)}
        className={linkClasses(currentPage <= 1)}
        aria-disabled={currentPage <= 1}
      >
        이전
      </Link>

      {pages.map((page) => (
        <Link
          key={page}
          href={buildHref(query, page)}
          className={cn(
            "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm transition-colors",
            page === currentPage
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-surface",
          )}
          aria-current={page === currentPage ? "page" : undefined}
        >
          {page}
        </Link>
      ))}

      <Link
        href={buildHref(query, currentPage + 1)}
        className={linkClasses(currentPage >= totalPages)}
        aria-disabled={currentPage >= totalPages}
      >
        다음
      </Link>
    </nav>
  );
}
