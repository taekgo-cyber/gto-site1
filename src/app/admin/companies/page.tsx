import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/dal";
import { listPendingCompanies } from "@/lib/company/admin";

export const metadata: Metadata = { title: "업체 승인 대기 목록 - 관리자" };
export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>관리자 권한 필요</CardTitle>
            <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button variant="outline" size="sm">
                로그인으로 이동
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Container>
    );
  }

  let companies: Awaited<ReturnType<typeof listPendingCompanies>> | null = null;
  let error: string | null = null;
  let isAdminRequired = false;

  try {
    companies = await listPendingCompanies({ adminUserId: user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.";
    if (msg === "ADMIN_REQUIRED") {
      isAdminRequired = true;
      error = "관리자 권한이 필요합니다. (ACTIVE ADMIN만 접근 가능)";
    } else {
      error = msg;
    }
  }

  if (isAdminRequired) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>접근 불가</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">현재 계정은 관리자 권한이 아닙니다.</p>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>조회 오류</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자</p>
          <h1 className="text-2xl font-bold">업체 승인 대기 목록</h1>
          <p className="text-sm text-muted-foreground">PENDING 상태의 업체만 표시됩니다. 상세에서 승인/반려를 처리합니다.</p>
        </div>
        <Link href="/mypage">
          <Button variant="ghost" size="sm">
            마이페이지
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>승인 대기 ({companies?.length ?? 0}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {!companies || companies.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">승인 대기 중인 업체가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {companies.map((company) => (
                <li key={company.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{company.name}</p>
                    <p className="text-xs text-muted-foreground">
                      사업자 {company.businessNumber} · 대표 {company.representativeName} · {new Date(company.createdAt).toLocaleDateString("ko-KR")}
                    </p>
                    <p className="text-xs text-muted-foreground">상태 {company.status}</p>
                  </div>
                  <Link href={`/admin/companies/${company.id}`}>
                    <Button variant="outline" size="sm">
                      상세 보기
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
