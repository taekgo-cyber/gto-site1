import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { countUnreadInAppNotifications } from "@/lib/notifications/service";

const NAV_ITEMS = [
  { label: "통합검색", href: "/search" },
  { label: "구인공고", href: "/jobs" },
  { label: "지입", href: "/lease" },
  { label: "CBT 시험", href: "/cbt" },
  { label: "블로그", href: "/blog" },
  { label: "구직정보", href: "/mypage/lead" },
  { label: "업체정보", href: "/companies" },
  { label: "고객지원", href: "/support" },
] as const;

export async function Header() {
  const user = await getCurrentUser();
  const unreadNotifications = user
    ? await countUnreadInAppNotifications(user.id)
    : 0;

  return (
    <header className="border-b border-border bg-background">
      <Container className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1 sm:min-h-16 sm:flex-nowrap sm:gap-4 sm:py-0">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md text-lg font-bold sm:text-xl"
        >
          트럭포털
        </Link>
        <nav
          aria-label="주요 메뉴"
          className="order-3 -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:justify-center sm:gap-2 sm:px-0 sm:pb-0"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <Link
                href="/notifications"
                className="relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-[15px] font-medium hover:bg-surface"
                aria-label={unreadNotifications > 0 ? `알림 ${unreadNotifications}개 읽지 않음` : "알림"}
              >
                알림
                {unreadNotifications > 0 ? (
                  <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] leading-none text-primary-foreground">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/mypage"
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-[15px] font-medium hover:bg-surface"
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
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-[15px] text-muted-foreground hover:bg-surface hover:text-foreground"
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
