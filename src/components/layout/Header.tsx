import Link from "next/link";
import { Brand } from "@/components/common/Brand";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { UnifiedSearchForm } from "@/components/search/UnifiedSearchForm";
import { PrimaryNavigation } from "@/components/layout/PrimaryNavigation";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { countUnreadInAppNotifications } from "@/lib/notifications/service";

export async function Header() {
  const user = await getCurrentUser();
  const unreadNotifications = user
    ? await countUnreadInAppNotifications(user.id)
    : 0;

  return (
    <header className="site-header sticky top-0 z-40 border-b border-border bg-background">
      <Container className="site-header-inner">
        <Link href="/" className="site-brand" aria-label="운전픽 홈"><Brand /></Link>
        <div className="site-navigation"><PrimaryNavigation /></div>
        <details className="site-header-search">
          <summary aria-label="통합검색 열기"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></summary>
          <div className="site-header-search-form"><UnifiedSearchForm formId="header-search" inputId="header-search-input" ariaLabel="헤더 통합검색" placeholder="검색어를 입력하세요" variant="compact" /></div>
        </details>
        <div className="site-auth flex shrink-0 items-center gap-1 lg:gap-2">
          {user ? (
            <>
              <Link
                href="/notifications"
                className="relative inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-semibold hover:bg-surface"
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
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-semibold hover:bg-surface"
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
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[#0f56c0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
