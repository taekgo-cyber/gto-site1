import Link from "next/link";
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur">
      <div className="hidden bg-brand-deep text-white sm:block">
        <Container className="flex h-8 items-center justify-between text-xs">
          <p className="font-medium text-white/75">화물·운전 일자리와 현장 정보를 한곳에서</p>
          <div className="flex items-center gap-4 text-white/80">
            <Link href="/company/apply" className="hover:text-white">업체 등록</Link>
            <Link href="/support" className="hover:text-white">광고·서비스 문의</Link>
          </div>
        </Container>
      </div>
      <Container className="flex min-h-[4.5rem] min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 lg:flex-nowrap lg:gap-6 lg:py-0">
        <Link href="/" className="group inline-flex min-h-12 shrink-0 items-center gap-2.5 rounded-lg">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-white shadow-sm transition-transform group-hover:-translate-y-0.5">운</span>
          <span className="flex flex-col leading-none">
            <span className="text-[1.35rem] font-black tracking-[-0.04em]">운전픽</span>
            <span className="mt-1 text-[10px] font-bold tracking-[0.08em] text-muted-foreground">CARGO &amp; DRIVER</span>
          </span>
        </Link>
        <div className="order-3 flex w-full lg:order-none lg:ml-3 lg:w-auto lg:max-w-md lg:flex-1">
          <UnifiedSearchForm
            formId="header-search"
            inputId="header-search-input"
            ariaLabel="헤더 통합검색"
            placeholder="검색어를 입력하세요"
            variant="compact"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
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
      <div className="border-t border-border/80">
        <Container>
          <PrimaryNavigation />
        </Container>
      </div>
    </header>
  );
}
