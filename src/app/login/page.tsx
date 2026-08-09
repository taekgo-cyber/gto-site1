import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/common/Container";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "로그인",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/mypage");

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">로그인</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </Container>
  );
}
