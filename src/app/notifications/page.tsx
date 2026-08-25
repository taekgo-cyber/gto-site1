import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Pagination } from "@/components/jobs/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/dal";
import { parseNotificationPage } from "@/lib/notifications/contract";
import {
  getNotificationPreferences,
  listInAppNotifications,
} from "@/lib/notifications/service";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  updateNotificationPreferencesAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림",
  robots: { index: false, follow: false },
};

const TYPE_LABEL = {
  SYSTEM: "시스템",
  ACTIVITY: "활동",
  CONTENT: "콘텐츠",
} as const;

function formatDate(date: Date): string {
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function NotificationsPage(
  props: PageProps<"/notifications">,
) {
  const user = await requireUser();
  const searchParams = await props.searchParams;
  const page = parseNotificationPage(searchParams.page);
  const [result, preferences] = await Promise.all([
    listInAppNotifications(user.id, page),
    getNotificationPreferences(user.id),
  ]);
  const unreadCount = result.items.filter((item) => item.readAt === null).length;

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">알림</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            최근 90일의 서비스 알림을 확인합니다.
          </p>
        </div>
        {unreadCount > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline">현재 알림 모두 읽음</Button>
          </form>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>알림 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateNotificationPreferencesAction} className="space-y-4">
            <label className="flex min-h-11 items-start gap-3 rounded-md border border-border p-3">
              <input
                type="checkbox"
                name="activityEnabled"
                defaultChecked={preferences.activityEnabled}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block text-sm font-medium">내 활동 알림</span>
                <span className="block text-sm text-muted-foreground">
                  업체 신청 처리 등 계정 활동 결과를 받습니다.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-3 rounded-md border border-border p-3">
              <input
                type="checkbox"
                name="contentEnabled"
                defaultChecked={preferences.contentEnabled}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block text-sm font-medium">콘텐츠 추천 알림</span>
                <span className="block text-sm text-muted-foreground">
                  기본값은 꺼짐이며, 동의한 경우에만 향후 추천 알림을 받습니다.
                </span>
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              보안·서비스 운영에 필요한 시스템 알림은 끌 수 없습니다. 이메일·문자·푸시는 발송하지 않습니다.
            </p>
            <Button type="submit">설정 저장</Button>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="notification-list-heading" className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 id="notification-list-heading" className="text-xl font-bold">받은 알림</h2>
          <p className="text-sm text-muted-foreground">총 {result.totalCount}건</p>
        </div>

        {result.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              받은 알림이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {result.items.map((item) => (
              <li key={item.id}>
                <Card className={item.readAt ? "opacity-75" : undefined}>
                  <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.readAt ? "muted" : "primary"}>
                        {TYPE_LABEL[item.type]}
                      </Badge>
                      {item.readAt ? null : <Badge variant="outline">읽지 않음</Badge>}
                      <span className="text-xs text-muted-foreground">{formatDate(item.deliveredAt)}</span>
                    </div>
                    <CardTitle className="text-base sm:text-lg">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.body ? <p className="text-sm text-muted-foreground">{item.body}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-primary hover:bg-surface"
                        >
                          자세히 보기
                        </Link>
                      ) : null}
                      {!item.readAt ? (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="notificationId" value={item.id} />
                          <Button type="submit" variant="ghost" size="sm">읽음 표시</Button>
                        </form>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          currentPage={result.page}
          totalPages={result.totalPages}
          basePath="/notifications"
          query={{}}
        />
      </section>
    </Container>
  );
}
