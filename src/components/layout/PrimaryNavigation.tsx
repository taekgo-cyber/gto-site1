"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "채용정보", href: "/jobs" },
  { label: "지입·차량", href: "/lease" },
  { label: "업체정보", href: "/companies" },
  { label: "CBT 시험", href: "/cbt" },
  { label: "블로그", href: "/blog" },
  { label: "고객지원", href: "/support" },
] as const;

export function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="scrollbar-hidden -mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-12 shrink-0 items-center whitespace-nowrap px-3 text-[15px] font-semibold transition-colors sm:px-4",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary sm:inset-x-4" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
