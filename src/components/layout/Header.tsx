import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";

const NAV_ITEMS = [
  { label: "구인공고", href: "/jobs" },
  { label: "지입", href: "/lease" },
  { label: "구직정보", href: "/" },
  { label: "업체정보", href: "/" },
  { label: "커뮤니티", href: "/" },
] as const;

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-border bg-background">
      <Container className="flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link href="/" className="shrink-0 text-lg font-bold sm:text-xl">
          트럭포털
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto sm:gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="whitespace-nowrap rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <Link
                href="/mypage"
                className="whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium hover:bg-surface"
              >
                {user.nickname ?? user.name}
              </Link>
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm">
                  로그아웃
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="whitespace-nowrap rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                로그인
              </Link>
              <Link href="/signup">
                <Button size="sm">회원가입</Button>
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
