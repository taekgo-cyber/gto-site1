import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/dal";
import { getPendingCompanyDetail } from "@/lib/company/admin";
import { ApproveForm, RejectForm } from "../AdminForms";

export const dynamic = "force-dynamic";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `업체 승인 상세 ${id} - 관리자` };
}

export default async function AdminCompanyDetailPage({ params }: { params: Promise<Params> }) {
  const { id: companyId } = await params;
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

  let company: Awaited<ReturnType<typeof getPendingCompanyDetail>> | null = null;
  let error: string | null = null;
  let isAdminRequired = false;

  try {
    company = await getPendingCompanyDetail({ adminUserId: user.id, companyId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.";
    if (msg === "ADMIN_REQUIRED") {
      isAdminRequired = true;
      error = "관리자 권한이 필요합니다. (ACTIVE ADMIN만 접근 가능)";
    } else if (msg === "COMPANY_NOT_FOUND") {
      error = "업체를 찾을 수 없습니다.";
    } else if (msg === "COMPANY_NOT_PENDING") {
      error = "승인 대기 상태의 업체만 조회할 수 있습니다.";
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
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (error || !company) {
    return (
      <Container className="mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>업체 상세 조회 불가</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error ?? "업체 정보를 불러오지 못했습니다."}
            </p>
            <Link href="/admin/companies">
              <Button variant="outline" size="sm">
                목록으로 돌아가기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">관리자 · 승인 대기 상세</p>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-sm text-muted-foreground">PENDING 상태만 승인/반려할 수 있습니다. actor는 서버 세션에서 도출됩니다.</p>
        </div>
        <Link href="/admin/companies">
          <Button variant="ghost" size="sm">
            목록
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>업체 기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">업체명</dt>
              <dd className="font-medium">{company.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">사업자등록번호</dt>
              <dd className="font-medium">{company.businessNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">대표자명</dt>
              <dd>{company.representativeName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">상태</dt>
              <dd>{company.status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">전화번호</dt>
              <dd>{company.phone ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">이메일</dt>
              <dd>{company.email ?? "-"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">주소</dt>
              <dd>
                {company.address ?? "-"}
                {company.addressDetail ? ` ${company.addressDetail}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">지역 ID</dt>
              <dd>{company.regionId ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">생성일</dt>
              <dd>{new Date(company.createdAt).toLocaleString("ko-KR")}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">소개</dt>
              <dd className="whitespace-pre-wrap">{company.introduction ?? "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ApproveForm companyId={company.id} />
        <RejectForm companyId={company.id} />
      </div>

      <p className="text-xs text-muted-foreground">승인 시 OWNER User.role이 필요한 경우 COMPANY로 승격되며, 반려 시 role은 유지됩니다. 모든 처리는 transaction 및 AdminLog로 기록됩니다.</p>
    </Container>
  );
}
