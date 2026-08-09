import Link from "next/link";
import { Container } from "@/components/common/Container";

const NAV_ITEMS = ["구인공고", "구직정보", "업체정보", "커뮤니티"] as const;

export function Header() {
  return (
    <header className="border-b border-border bg-background">
      <Container className="flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link href="/" className="shrink-0 text-lg font-bold sm:text-xl">
          트럭포털
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto sm:gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item}
              href="/"
              className="whitespace-nowrap rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              {item}
            </Link>
          ))}
        </nav>
      </Container>
    </header>
  );
}
