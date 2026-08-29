import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { countUnreadInAppNotifications } from "@/lib/notifications/service";

const PRIMARY_NAV_ITEMS = [
  { label: "구인공고", href: "/jobs" },
  { label: "지입", href: "/lease" },
  { label: "CBT 시험", href: "/cbt" },
  { label: "업체정보", href: "/companies" },
  { label: "블로그", href: "/blog" },
] as const;

export async function Header() {
  const user = await getCurrentUser();
  const unreadNotifications = user
    ? await countUnreadInAppNotifications(user.id)
    : 0;

  return (
    <header className="border-b border-border bg-background">
      <Container className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-2 sm:min-h-16 sm:flex-nowrap sm:gap-3 sm:py-0">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md text-lg font-bold sm:text-xl"
        >
          트럭포털
        </Link>
        <div className="order-3 flex w-full sm:order-2 sm:mx-2 sm:w-auto sm:flex-1 sm:max-w-[320px] lg:max-w-sm">
          <UnifiedSearchForm
            formId="header-search"
            inputId="header-search-input"
            ariaLabel="헤더 통합검색"
            placeholder="검색어를 입력하세요"
            variant="compact"
          />
        </div>
        <nav
          aria-label="주요 메뉴"
          className="order-4 -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-1 sm:order-3 sm:mx-0 sm:w-auto sm:flex-none sm:gap-1 sm:px-0 sm:pb-0"
        >
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:order-4 sm:gap-2">
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
              <Link
                href="/signup"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-3.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
