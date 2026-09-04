import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCompanyMemberships, requireUser } from "@/lib/auth/dal";
import { getCompanyApplicationForOwner } from "@/lib/company/service";
import { CompanyEditForm, CompanyNewForm } from "@/components/company/CompanyApplyForm";

export const metadata: Metadata = { title: "업체 등록 신청" };

export default async function CompanyApplyPage() {
  const user = await requireUser("/company/apply");
  const memberships = await getCompanyMemberships(user.id);
  const owned = memberships.filter(
    (m) => m.role === "OWNER" && m.status === "ACTIVE",
  );

  if (owned.length === 0) {
    return (
      <Container className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">업체 서비스</p>
            <h1 className="text-2xl font-bold">업체 등록 신청</h1>
          </div>
          <Link href="/mypage"><Button variant="ghost" size="sm">마이페이지</Button></Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>신규 업체 등록</CardTitle>
            <p className="text-sm text-muted-foreground">로그인한 사용자는 업체명, 사업자등록번호, 대표자명 등 기본 정보를 입력해 신청할 수 있습니다. 승인 전에는 PENDING 상태로 저장됩니다.</p>
          </CardHeader>
          <CardContent>
            <CompanyNewForm />
          </CardContent>
        </Card>
      </Container>
    );
  }

  // If multiple owned companies exist, show the first PENDING/REJECTED, otherwise the first entry
  const target = owned.find((m) => m.companyStatus === "PENDING" || m.companyStatus === "REJECTED") ?? owned[0]!;
  let company: Awaited<ReturnType<typeof getCompanyApplicationForOwner>> | null = null;
  let loadError: string | null = null;
  try {
    company = await getCompanyApplicationForOwner({
      actorUserId: user.id,
      companyId: target.companyId,
    });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "업체 정보를 불러오지 못했습니다.";
  }

  if (loadError || !company) {
    return (
      <Container className="mx-auto max-w-2xl space-y-6 py-8">
        <Card>
          <CardHeader><CardTitle>업체 신청 정보</CardTitle></CardHeader>
          <CardContent>
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError ?? "업체 정보를 찾을 수 없습니다."}</p>
            <Link href="/mypage" className="mt-4 inline-block"><Button variant="outline" size="sm">마이페이지로</Button></Link>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (company.status === "ACTIVE") {
    return (
      <Container className="mx-auto max-w-2xl space-y-6 py-8">
        <Card>
          <CardHeader><CardTitle>업체 등록 완료</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-700">이미 승인된 업체가 있습니다. (ACTIVE)</p>
            <dl className="grid gap-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">업체명</dt><dd className="font-medium">{company.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">사업자등록번호</dt><dd>{company.businessNumber}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">대표자</dt><dd>{company.representativeName}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">승인된 업체는 이 화면에서 수정할 수 없습니다.</p>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">업체 서비스</p>
          <h1 className="text-2xl font-bold">업체 신청 상태</h1>
        </div>
        <Link href="/mypage"><Button variant="ghost" size="sm">마이페이지</Button></Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{company.status === "PENDING" ? "승인 대기 중인 업체" : "반려된 업체"}</CardTitle>
          <p className="text-sm text-muted-foreground">소유자(OWNER) 본인만 조회·수정할 수 있으며, 승인 전에는 User.role이 COMPANY가 아니어도 접근할 수 있습니다.</p>
        </CardHeader>
        <CardContent>
          <CompanyEditForm
            company={{
              id: company.id,
              status: company.status,
              name: company.name,
              businessNumber: company.businessNumber,
              representativeName: company.representativeName,
              phone: company.phone,
              email: company.email,
              address: company.address,
              addressDetail: company.addressDetail,
              regionId: company.regionId,
              introduction: company.introduction,
            }}
          />
        </CardContent>
      </Card>
      {owned.length > 1 ? (
        <Card>
          <CardHeader><CardTitle>다른 소유 업체</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {owned
                .filter((m) => m.companyId !== target.companyId)
                .map((m) => (
                  <li key={m.companyId} className="flex justify-between rounded-md border border-border px-3 py-2">
                    <span>{m.companyName}</span><span className="text-muted-foreground">{m.companyStatus}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
