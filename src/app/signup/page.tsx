import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/common/Container";
import { SignupForm } from "@/components/auth/SignupForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/dal";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "회원가입",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const next = normalizeAuthRedirect(params.next);
  if (user) redirect(next);

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">회원가입</CardTitle>
        </CardHeader>
        <CardContent>
          <SignupForm next={next} />
        </CardContent>
      </Card>
    </Container>
  );
}
