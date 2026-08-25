import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "서비스 점검 중",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center py-12">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>서비스를 잠시 점검하고 있습니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>안전한 운영을 위해 일시적으로 공개 화면 이용을 제한하고 있습니다.</p>
          <p>잠시 후 다시 접속해 주세요. 관리자 운영 및 상태 확인 경로는 계속 동작합니다.</p>
        </CardContent>
      </Card>
    </Container>
  );
}
