import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { WithdrawForm } from "@/components/auth/WithdrawForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { getCompanyMemberships, requireUser } from "@/lib/auth/dal";
import {
  companyMemberRoleLabel,
  userRoleLabel,
} from "@/lib/auth/labels";

export const metadata: Metadata = {
  title: "마이페이지",
};

export default async function MyPage() {
  const user = await requireUser();
  const memberships = await getCompanyMemberships(user.id);

  return (
    <Container className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="text-2xl font-bold">마이페이지</h1>

      <Card>
        <CardHeader>
          <CardTitle>내 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">이름</dt>
            <dd>{user.name}</dd>
            <dt className="text-muted-foreground">이메일</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">닉네임</dt>
            <dd>{user.nickname ?? "-"}</dd>
            <dt className="text-muted-foreground">전화번호</dt>
            <dd>{user.phone ?? "-"}</dd>
            <dt className="text-muted-foreground">회원 유형</dt>
            <dd>{userRoleLabel(user.role)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>소속 업체</CardTitle>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              소속된 업체가 없습니다. (업체 등록 기능은 추후 제공 예정)
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {memberships.map((membership) => (
                <li
                  key={membership.companyId}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <span className="font-medium">{membership.companyName}</span>
                  <span className="text-muted-foreground">
                    {companyMemberRoleLabel(membership.role)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내 CBT 학습</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            틀린 문제, 북마크, 모의고사 기록을 확인하고 복습할 수 있습니다.
          </p>
          <Link href="/cbt/my" className="mt-4 block">
            <Button size="sm">내 CBT로 이동</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>프로필 수정</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            user={{
              name: user.name,
              nickname: user.nickname,
              phone: user.phone,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>비밀번호 변경</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>회원 탈퇴</CardTitle>
        </CardHeader>
        <CardContent>
          <WithdrawForm />
        </CardContent>
      </Card>
    </Container>
  );
}
